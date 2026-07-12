import { CPRRollDialog } from "./cpr-roll-dialog.js";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const CPR_SLIDE_PANEL_Z_INDEX = 9999;
const CPR_SLIDE_PANEL_GUTTER_PX = 16;

function prefersReducedMotion() {
  return window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches ?? false;
}

// `window: { positioned: false }` (see DEFAULT_OPTIONS below) tells Foundry
// not to manage this window's position/z-index at all, which also disables
// its usual bring-to-front-on-focus behavior. Measure the real sidebar/
// hotbar geometry and pin a static z-index high enough to clear Foundry's
// own actively-managed window stack, since `--z-index-canvas` (the PIXI
// canvas layer) sits below the UI/interface layer and isn't a safe baseline
// for a floating panel meant to sit above it.
//
// Docks the panel at the end of the hotbar row (flush with its right edge
// and bottom band) rather than floating above it, so it reads as part of
// the same UI row instead of an unrelated overlay.
const CPR_SLIDE_PANEL_MIN_WIDTH_PX = 288;

function applySlidePanelLayout(el) {
  if (!(el instanceof HTMLElement)) return;
  const sidebar = document.getElementById("sidebar");
  const sidebarLeft =
    sidebar && sidebar.offsetParent !== null
      ? sidebar.getBoundingClientRect().left
      : window.innerWidth;

  const hotbar = document.getElementById("hotbar");
  let left = CPR_SLIDE_PANEL_GUTTER_PX;
  let bottom = CPR_SLIDE_PANEL_GUTTER_PX;
  if (hotbar && hotbar.offsetParent !== null) {
    const rect = hotbar.getBoundingClientRect();
    left = rect.right + CPR_SLIDE_PANEL_GUTTER_PX;
    bottom = Math.max(window.innerHeight - rect.bottom, 0);
  }
  const available = Math.max(
    sidebarLeft - left - CPR_SLIDE_PANEL_GUTTER_PX,
    CPR_SLIDE_PANEL_MIN_WIDTH_PX
  );

  el.style.setProperty("--cpr-slide-panel-left", `${left}px`);
  el.style.setProperty("--cpr-slide-panel-bottom", `${bottom}px`);
  el.style.setProperty("--cpr-slide-panel-max-width", `${available}px`);
  el.style.setProperty("--cpr-slide-panel-z", String(CPR_SLIDE_PANEL_Z_INDEX));
  // eslint-disable-next-line no-param-reassign
  el.style.zIndex = String(CPR_SLIDE_PANEL_Z_INDEX);
}

/**
 * Non-modal, screen-anchored variant of CPRRollDialog used to confirm
 * attack rolls. Reuses all of CPRRollDialog's situational-mod/aimed-shot/
 * form-data handling unchanged; only the window chrome, CSS-driven
 * anchoring, and slide in/out animation differ.
 */
export default class CPRRollSlidePanel extends CPRRollDialog {
  static DEFAULT_OPTIONS = {
    id: "cpr-roll-slide-panel",
    classes: ["dialog", "cpr-roll-slide-panel"],
    window: {
      frame: false,
      positioned: false,
      resizable: false,
    },
  };

  /**
   * The static `DEFAULT_OPTIONS.id` above is shared by every instance of
   * this class. That's fine for a single confirmation dialog at a time,
   * but this panel can legitimately have two live instances at once (e.g.
   * an attack panel still mid-close-animation when an automated damage
   * roll opens a second panel right after) since `close()` is async and
   * nothing awaits it before the next instance is constructed. Give each
   * instance its own id so they never collide in Foundry's window
   * tracking/DOM.
   */
  constructor(rollData, actor, item, options = {}) {
    const uniqueOptions = foundry.utils.mergeObject(
      options,
      { id: `cpr-roll-slide-panel-${foundry.utils.randomID()}` },
      { inplace: false }
    );
    super(rollData, actor, item, uniqueOptions);
  }

  /**
   * Kick off the slide-in transition once the panel is first rendered.
   *
   * @override
   */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    const el = this.element;
    if (!(el instanceof HTMLElement)) return;

    // Layout/z-index must apply regardless of reduced-motion settings.
    applySlidePanelLayout(el);
    el.addEventListener("pointerdown", () => {
      el.style.zIndex = String(CPR_SLIDE_PANEL_Z_INDEX);
    });

    if (prefersReducedMotion()) return;
    el.classList.add("cpr-slide-entering");
    // Force a reflow so the "entering" state is painted before it's removed,
    // otherwise the browser may coalesce both class changes into one frame.
    el.getBoundingClientRect();
    window.requestAnimationFrame(() =>
      el.classList.remove("cpr-slide-entering")
    );
  }

  /**
   * Play the slide-out transition before the panel is actually removed.
   *
   * @override
   */
  async close(options) {
    const el = this.element;
    if (!(el instanceof HTMLElement) || prefersReducedMotion()) {
      return super.close(options);
    }
    await new Promise((resolve) => {
      let resolved = false;
      let onTransitionEnd;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        el.removeEventListener("transitionend", onTransitionEnd);
        resolve();
      };
      onTransitionEnd = (event) => {
        if (event.target === el && event.propertyName === "transform") {
          finish();
        }
      };
      el.addEventListener("transitionend", onTransitionEnd);
      // Fallback in case transitionend doesn't fire (e.g. display:none ancestor).
      setTimeout(finish, 250);
      el.classList.add("cpr-slide-leaving");
    });
    return super.close(options);
  }
}
