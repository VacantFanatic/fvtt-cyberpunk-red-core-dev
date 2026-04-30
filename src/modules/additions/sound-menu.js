/* eslint-disable class-methods-use-this */
/* global FilePicker */
import { ADDITIONS_SETTINGS } from "./constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class SoundMenu extends HandlebarsApplicationMixin(
  ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: "cpr-additions-sounds-menu",
    classes: ["sheet"],
    tag: "section",
    position: {
      width: 500,
      height: 500,
    },
    window: {
      title: "CPR.additions.settings.soundSelect.name",
      resizable: true,
    },
    actions: {
      addRow: SoundMenu.#onAddRow,
      removeRow: SoundMenu.#onRemoveRow,
      saveSounds: SoundMenu.#onSaveSounds,
    },
  };

  static PARTS = {
    body: {
      template: "systems/cyberpunk-red-core/templates/additions/soundmenu.html",
    },
  };

  constructor(options = {}) {
    super(options);
    this.userSounds = foundry.utils.deepClone(
      game.settings.get(game.system.id, ADDITIONS_SETTINGS.configuredSounds)
    );
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.userSounds = this.userSounds;
    return context;
  }

  static #onAddRow() {
    const current = this.userSounds?.at?.(-1) ?? "";
    new FilePicker({
      type: "audio",
      current,
      callback: (path) => {
        this.userSounds.push(path);
        this.render(true);
      },
      top: this.position.top + 40,
      left: this.position.left + 10,
    }).browse(current);
  }

  static #onRemoveRow(event, target) {
    event.preventDefault();
    const index = Number(target.dataset.index);
    if (Number.isNaN(index)) return;
    this.userSounds.splice(index, 1);
    this.render(true);
  }

  static async #onSaveSounds(event) {
    event.preventDefault();
    await game.settings.set(
      game.system.id,
      ADDITIONS_SETTINGS.configuredSounds,
      this.userSounds
    );
    this.close();
  }
}
