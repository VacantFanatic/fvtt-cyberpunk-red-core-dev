import CPRChat from "../../chat/cpr-chat.js";
import SystemUtils from "../../utils/cpr-systemUtils.js";
import createImageContextMenu from "../../utils/cpr-imageContextMenu.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const TextEditor = foundry.applications.ux.TextEditor.implementation;

/**
 * Implement the Demon sheet, which extends ActorSheet directly from Foundry. This does
 * not extend CPRActor, as there is very little overlap between Demons and mooks/characters.
 *
 * @extends {ActorSheetV2}
 */
export default class CPRDemonActorSheet extends HandlebarsApplicationMixin(
  ActorSheetV2
) {
  static DEFAULT_OPTIONS = {
    classes: ["sheet", "actor"],
    position: {
      width: 600,
      height: "auto",
    },
    window: {
      resizable: true,
    },
  };

  static PARTS = {
    sheet: {
      template:
        "systems/cyberpunk-red-core/templates/actor/cpr-demon-sheet.hbs",
    },
  };

  static get defaultOptions() {
    const resizeCPRSheets = game.settings.get(
      game.system.id,
      "resizeCPRSheets"
    );

    return foundry.utils.mergeObject(super.defaultOptions, {
      position: {
        width: 600,
        height: resizeCPRSheets ? 275 : "auto",
      },
      window: {
        resizable: true,
      },
    });
  }

  /**
   * Get actor data into a more convenient organized structure.
   * Remember, this data is on the DemonActorSheet object, not the CPRActor
   * object it is tied to. (this.actor)
   *
   * @override
   * @returns {Object} data - a curated structure of actorSheet data
   */
  async _prepareContext(options) {
    const sheetData = await super._prepareContext(options);
    sheetData.enrichedHTML = sheetData.enrichedHTML ?? {};
    sheetData.enrichedHTML.notes = await TextEditor.enrichHTML(
      this.actor.system.notes,
      { async: true }
    );
    return sheetData;
  }

  /**
   * Activate listeners for the sheet. This has to call super at the end for Foundry to process
   * events properly.
   *
   * @override
   * @param {Object} html - the DOM object
   */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelectorAll(".rollable").forEach((element) => {
      element.addEventListener("click", (event) => this._onRoll(event));
    });
    this._createDemonImageContextMenu([this.element]);
  }

  /**
   * Dispatcher that executes a roll based on the "type" passed in the event. While very similar
   * to _onRoll in CPRActor, Demon sheets have far fewer cases to consider, and copying some of the code
   * here seemed better than making them extend a 1000-line class where most of it didn't apply.
   *
   * @private
   * @callback
   * @param {Object} event - object with details of the event
   */
  async _onRoll(event) {
    const rollName = SystemUtils.GetEventDatum(event, "data-roll-title");
    const cprRoll = this.actor.createStatRoll(rollName);

    const keepRolling = await cprRoll.handleRollDialog(event, this.actor);
    if (!keepRolling) {
      return;
    }
    await cprRoll.roll();

    // output to chat
    const token = this.token === null ? null : this.token._id;
    cprRoll.entityData = { actor: this.actor.id, token };
    CPRChat.RenderRollCard(cprRoll);
  }

  /**
   * Sets up a ContextMenu that appears when the Actor's image is right clicked.
   * Enables the user to share the image with other players.
   *
   * @param {Object} html - The DOM object
   * @returns {object} The created ContextMenu
   */
  _createDemonImageContextMenu(html) {
    return createImageContextMenu(html, ".demon-icon", this.actor);
  }
}
