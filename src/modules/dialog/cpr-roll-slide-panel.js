import { CPRRollDialog } from "./cpr-roll-dialog.js";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion() {
  return window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches ?? false;
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
   * Kick off the slide-in transition once the panel is first rendered.
   *
   * @override
   */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    const el = this.element;
    if (!(el instanceof HTMLElement) || prefersReducedMotion()) return;
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
