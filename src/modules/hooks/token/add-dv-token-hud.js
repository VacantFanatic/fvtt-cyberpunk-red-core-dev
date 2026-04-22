import HudInterface from "../../hud/interface.js";

/**
 * Resolve the TokenDocument for TokenHUD rendering (Foundry v13–v14).
 * v13 passes it as the 3rd hook argument; v14 ApplicationV2 often omits it — use the HUD binding.
 * @param {*} hud - Token HUD application instance
 * @param {*} [thirdArg] - Token document when provided by the hook
 */
function tokenDocumentFromHud(hud, thirdArg) {
  if (thirdArg) return thirdArg;
  return hud.object?.document ?? hud.document;
}

function dismissTokenHud(hud) {
  if (typeof hud.clear === "function") hud.clear();
  else hud.close?.();
}

const AddDvTokenHud = () => {
  /**
   * Add DV icon to token HUD to allow easy selection of DV table entries
   *
   * @public
   * @memberof hookEvents
   * @param {Document} hud - Instance of the token HUD provided by Foundry
   * @param {object} html  - HTML DOM object
   * @param {string} token - token data
   */
  Hooks.on("renderTokenHUD", async (hud, html, thirdArg) => {
    const token = tokenDocumentFromHud(hud, thirdArg);
    if (!token) return;

    const $html = $(html); // TODO: Remove JQuery.
    const dvHudTemplate = `systems/${game.system.id}/templates/hud/dv.hbs`;
    const dvDisplay = await foundry.applications.handlebars.renderTemplate(
      dvHudTemplate,
      token.flags
    );
    $html.find("div.left").append(dvDisplay);
    $html.find(".dv-table-selector").click(() => {
      HudInterface.SetDvTable(token);
      dismissTokenHud(hud);
    });
  });
};

export default AddDvTokenHud;
