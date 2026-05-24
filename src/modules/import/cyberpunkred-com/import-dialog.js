/**
 * Import code dialog for cyberpunkred.com character exports.
 */

import loadCharacter from "./firebase.js";
import { getCharacterType, isV2Character } from "./import-character.js";
import CPRDialog from "../../dialog/cpr-dialog-application.js";
import SystemUtils from "../../utils/cpr-systemUtils.js";
import LOGGER from "../../utils/cpr-logger.js";

let activeDialog;

function isQuickInsertAvailable() {
  return window.QuickInsert !== undefined;
}

export default class CyberpunkRedComImportDialog extends CPRDialog {
  static PARTS = {
    form: {
      template:
        "systems/cyberpunk-red-core/templates/dialog/cpr-cyberpunkred-com-import.hbs",
    },
  };

  /**
   * @param {object} options
   * @param {"create"|"import"} [options.mode]
   * @param {Actor} [options.actor]
   */
  constructor(options = {}) {
    super(
      {},
      {
        title: SystemUtils.Localize("CPR.import.cyberpunkredCom.dialogTitle"),
        submitOnChange: false,
        form: {
          submitOnChange: false,
          closeOnSubmit: false,
        },
        actions: {
          submitImport: CyberpunkRedComImportDialog.#onSubmitImport,
          cancelImport: CyberpunkRedComImportDialog.#onCancelImport,
        },
      }
    );
    this.mode = options.mode ?? "create";
    this.targetActor = options.actor ?? null;
    this.characterData = null;
    this._previewName = "";
    this._previewMessage = "";
    this._invalidCode = false;
    this._importResolve = options.resolve;
    this._settled = false;
  }

  /**
   * @param {object} [options]
   * @returns {Promise<{code: string, data: object, actor?: Actor, mode: string}|null>}
   */
  static prompt(options = {}) {
    if (activeDialog) {
      activeDialog.close();
    }
    return new Promise((resolve) => {
      const dialog = new CyberpunkRedComImportDialog({
        ...options,
        resolve,
      });
      activeDialog = dialog;
      dialog.render({ force: true }).catch((err) => {
        LOGGER.error(err);
        ui.notifications.error(
          SystemUtils.Localize("CPR.import.cyberpunkredCom.dialogOpenFailed")
        );
        resolve(null);
      });
    });
  }

  static #onSubmitImport(event) {
    event?.preventDefault();
    this.submitImport();
  }

  static #onCancelImport(event) {
    event?.preventDefault();
    this.cancelImport();
  }

  async _prepareContext(options) {
    const data = await super._prepareContext(options);
    data.previewName = this._previewName;
    data.previewMessage = this._previewMessage;
    data.invalidCode = this._invalidCode;
    data.canImport = Boolean(this.characterData);
    return data;
  }

  _onClose(options = {}) {
    if (activeDialog === this) {
      activeDialog = null;
    }
    if (!this._settled && !options?.submitted) {
      this._settled = true;
      this._importResolve?.(null);
    }
    return super._onClose(options);
  }

  cancelImport() {
    if (!this._settled) {
      this._settled = true;
      this._importResolve?.(null);
    }
    this.close();
  }

  submitImport() {
    if (!this.characterData) {
      ui.notifications.warn(
        SystemUtils.Localize("CPR.import.cyberpunkredCom.enterValidCode")
      );
      return;
    }
    const code = this.element
      ?.querySelector(".character-import-code")
      ?.value?.trim()
      .toUpperCase();
    if (!code) return;
    if (this._settled) return;
    this._settled = true;
    const payload = {
      code,
      data: this.characterData,
      actor: this.targetActor,
      mode: this.mode,
    };
    this._importResolve?.(payload);
    this.close({ submitted: true });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root =
      this.element?.querySelector("[data-application-part='form']") ??
      this.element;
    const codeInput = root?.querySelector(".character-import-code");
    if (!codeInput || codeInput.dataset.cprImportBound) return;
    codeInput.dataset.cprImportBound = "true";
    let lastCode = "";
    codeInput.addEventListener("input", () => {
      const code = codeInput.value.trim().toUpperCase();
      if (code === lastCode) return;
      lastCode = code;
      this.#onCodeChanged(code);
    });
  }

  async #onCodeChanged(code) {
    this._invalidCode = false;
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      this.characterData = null;
      this._previewName =
        code.length > 0
          ? game.i18n.localize("CPR.import.cyberpunkredCom.invalidCode")
          : "";
      this._invalidCode = code.length > 0;
      this._previewMessage = "";
      return this.render();
    }

    this._previewName = game.i18n.localize(
      "CPR.import.cyberpunkredCom.loading"
    );
    this._previewMessage = "";
    await this.render();

    try {
      const characterData = await loadCharacter(code);
      this.characterData = characterData;
      const characterType = getCharacterType(characterData);
      this._previewName = game.i18n.format(
        "CPR.import.cyberpunkredCom.preview",
        { type: characterType, name: characterData.name }
      );
      const messages = [];
      if (isV2Character(characterData) && !isQuickInsertAvailable()) {
        messages.push(
          game.i18n.localize("CPR.import.cyberpunkredCom.v2QuickInsertWarning")
        );
      }
      if (
        this.mode === "import" &&
        this.targetActor &&
        this.targetActor.flags?.core?.sheetClass ===
          `${game.system.id}.CPRMookActorSheet`
      ) {
        messages.push(
          game.i18n.localize("CPR.import.cyberpunkredCom.mookSheetWarning")
        );
      }
      this._previewMessage = messages.join("<br>");
    } catch (err) {
      LOGGER.error(err);
      this.characterData = null;
      this._previewName = String(err.message ?? err);
      this._invalidCode = true;
      this._previewMessage = "";
    }
    return this.render();
  }
}
