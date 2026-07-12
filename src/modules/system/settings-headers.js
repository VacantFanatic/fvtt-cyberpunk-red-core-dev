import LOGGER from "../utils/cpr-logger.js";

/**
 * Foundry v13/v14 has no native way to group settings into visual sections
 * within a single package's flat settings list (open, unshipped upstream
 * proposal: foundryvtt/foundryvtt#13541). This ordered list mirrors the
 * informal comment groupings already present in settings.js/additions/
 * settings.js and inserts a divider before the first setting of each
 * cluster when the Settings Config form renders.
 */
const SETTINGS_HEADERS = [
  { beforeKey: "theme", label: "CPR.settings.headers.display" },
  { beforeKey: "compendiumSettingsMenu", label: "CPR.settings.headers.game" },
  {
    beforeKey: "playersCreateInventory",
    label: "CPR.settings.headers.system",
  },
  { beforeKey: "debugLogs", label: "CPR.settings.headers.dev" },
  {
    beforeKey: "hitAnimations",
    label: "CPR.settings.headers.hitFeedback",
  },
  { beforeKey: "showDvDisplay", label: "CPR.settings.headers.dvDisplay" },
  {
    beforeKey: "hideCoverTokenOnPlace",
    label: "CPR.settings.headers.coverTokens",
  },
  {
    beforeKey: "poorWeaponCheck",
    label: "CPR.settings.headers.combatAutomation",
  },
  {
    beforeKey: "dfAmbientLightsEnable",
    label: "CPR.settings.headers.visualIntegrations",
  },
  {
    beforeKey: "itemPilesHandling",
    label: "CPR.settings.headers.itemPiles",
  },
];

/**
 * Find the form-group (or menu button) element for a given setting/menu key
 * within the rendered Settings Config form. Foundry renders each setting's
 * input with a `name="<namespace>.<key>"` attribute and each registered
 * menu as a button with `data-key="<namespace>.<key>"`; both are wrapped in
 * a `.form-group`.
 *
 * @param {HTMLElement} root
 * @param {string} key
 * @returns {HTMLElement|null}
 */
function findSettingFormGroup(root, key) {
  const fullKey = `${game.system.id}.${key}`;
  const field = root.querySelector(
    `[name="${fullKey}"], [data-key="${fullKey}"]`
  );
  return field ? field.closest(".form-group") : null;
}

/**
 * Insert section-header dividers into the rendered Settings Config form,
 * grouping this system's settings to disambiguate related-but-distinct
 * toggles (e.g. "Use Sliding Panel..." vs "Auto-Roll Damage on Hit").
 * Wrapped defensively: a Foundry DOM structure this repo hasn't verified
 * against live source should degrade to "no headers shown", not break the
 * settings menu.
 *
 * @param {Application} app
 * @param {HTMLElement|JQuery} html
 */
function insertSettingsHeaders(app, html) {
  try {
    const root = html instanceof HTMLElement ? html : html[0];
    if (!root) return;
    SETTINGS_HEADERS.forEach(({ beforeKey, label }) => {
      const formGroup = findSettingFormGroup(root, beforeKey);
      if (!formGroup) return;
      const header = document.createElement("h3");
      header.classList.add("cpr-settings-header");
      header.textContent = game.i18n.localize(label);
      formGroup.before(header);
    });
  } catch (err) {
    LOGGER.error("Failed to insert settings section headers", err);
  }
}

const registerSettingsHeaders = () => {
  Hooks.on("renderSettingsConfig", insertSettingsHeaders);
};

export default registerSettingsHeaders;
