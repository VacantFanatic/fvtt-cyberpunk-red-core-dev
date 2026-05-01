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
    tag: "form",
    position: {
      width: 600,
      height: "auto",
    },
    window: {
      resizable: true,
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
  };

  static PARTS = {
    sheet: {
      template:
        "systems/cyberpunk-red-core/templates/actor/cpr-demon-sheet.hbs",
    },
  };

  /**
   * Apply `resizeCPRSheets` before `super()` so V2's frozen options see the merged
   * height (never read settings from a dead V1 `static get defaultOptions`, which V2 ignores).
   *
   * @param {object} [options]
   */
  constructor(options = {}) {
    const merged = foundry.utils.mergeObject({}, options ?? {});
    if (game?.settings?.get) {
      const resize = game.settings.get(game.system.id, "resizeCPRSheets");
      if (resize) {
        merged.position = foundry.utils.mergeObject(merged.position ?? {}, {
          height: 275,
        });
      }
    }
    super(merged);
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
   * Activate listeners for the sheet. Delegate `.rollable` from the stable application
   * root so `_onRoll` survives re-renders without accumulating duplicate handlers.
   *
   * @override
   * @param {object} context
   * @param {object} options
   */
  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    if (!(root instanceof HTMLElement)) return;

    if (!root.dataset.cprDemonRollableBound) {
      root.dataset.cprDemonRollableBound = "1";
      root.addEventListener("click", (event) => {
        const matched = event.target?.closest?.(".rollable");
        if (!matched || !root.contains(matched)) return;
        const wrapped = new Proxy(event, {
          get(target, prop) {
            if (prop === "currentTarget") return matched;
            const value = target[prop];
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        this._onRoll(wrapped);
      });
    }

    if (!root.dataset.cprDemonImgMenuBound) {
      root.dataset.cprDemonImgMenuBound = "1";
      this._createDemonImageContextMenu(root);
    }
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
   * Right-click menu on portrait (share image). Uses a DOM selector that matches
   * {@link templates/actor/cpr-demon-sheet.hbs} markup.
   *
   * @param {HTMLElement} html - sheet root (`this.element`)
   * @returns {object|undefined} The created ContextMenu
   */
  _createDemonImageContextMenu(html) {
    const root =
      html instanceof HTMLElement
        ? html
        : html?.[0] instanceof HTMLElement
        ? html[0]
        : null;
    if (!root) return undefined;
    return createImageContextMenu(
      [root],
      ".demon-image .profile-img",
      this.actor
    );
  }
}
