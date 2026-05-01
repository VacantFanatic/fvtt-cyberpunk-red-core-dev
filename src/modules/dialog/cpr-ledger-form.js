import LOGGER from "../utils/cpr-logger.js";
import SystemUtils from "../utils/cpr-systemUtils.js";
import CPRDialog from "./cpr-dialog-application.js";

/**
 * Dialog which extends CPRDialog to display and modify the ledger property.
 */
export default class CPRLedger extends CPRDialog {
  // Application V2 reads the rendered template from `static PARTS`, NOT from
  // an `options.template` key (that was V1). Without our own `form` part the
  // ledger fell back to the base CPRDialog prompt template, which is why
  // ledger windows opened with only the confirm bar visible.
  static PARTS = {
    form: {
      // `game.system.id` is unsafe at module load time; use the literal id.
      template:
        "systems/cyberpunk-red-core/templates/dialog/cpr-ledger-form.hbs",
    },
  };

  // Ledger-specific V2 options. These are deep-merged with CPRDialog's
  // DEFAULT_OPTIONS by the framework, so the parent's actions / buttons /
  // form handler are still available.
  static DEFAULT_OPTIONS = {
    position: { width: 600 },
    form: { submitOnChange: false },
    actions: {
      add: CPRLedger.#onLedgerAdd,
      subtract: CPRLedger.#onLedgerSubtract,
      set: CPRLedger.#onLedgerSet,
      deleteLedgerLine: CPRLedger.#onDeleteLedgerLineAction,
    },
  };

  constructor(actor, propName, options = {}) {
    const ledgername = "CPR.ledger.".concat(propName.toLowerCase());
    const resizeCPRSheets = game.settings.get(
      game.system.id,
      "resizeCPRSheets"
    );
    // Application V2 freezes `this.options` after `super()`. Per-instance
    // overrides (title, settings-driven height) must be merged BEFORE super.
    const merged = foundry.utils.mergeObject(
      options,
      {
        title: SystemUtils.Format("CPR.ledger.title", {
          property: SystemUtils.Localize(ledgername),
        }),
        position: { height: resizeCPRSheets ? 340 : "auto" },
      },
      { inplace: false }
    );
    super(actor.system[propName], merged);
    this.actor = actor;
    this.total = actor.system[propName].value;

    // Generates the localization strings for:
    //   "CPR.ledger.wealth"
    //   "CPR.ledger.improvementpoints"
    //    "CPR.ledger.reputation"
    // This comment has been added to allow for automated checks
    // of localization strings in the code.
    this.propName = propName;
    this.ledgername = ledgername;
    this.contents = actor.listRecords(propName);
    this._makeLedgerReadable(propName);
  }

  /**
   * Set the data used for the ledger template.
   *
   * @return {Object} - a structured object representing ledger data.
   */
  async _prepareContext(options) {
    const data = await super._prepareContext(options);
    data.total = this.total;
    data.ledgername = this.ledgername;
    data.contents = this.contents;
    data.isGM = game.user.isGM;
    return data;
  }

  // V2 action handlers receive (event, target) and are bound to the
  // application instance. Each one delegates to `_updateLedger` with the
  // explicit action string instead of reading `data-action` back off the DOM.
  static #onLedgerAdd(_event, _target) {
    return this._updateLedger("add");
  }

  static #onLedgerSubtract(_event, _target) {
    return this._updateLedger("subtract");
  }

  static #onLedgerSet(_event, _target) {
    return this._updateLedger("set");
  }

  static #onDeleteLedgerLineAction(_event, target) {
    // `_deleteLedgerLine` is async and reads `data-line` via
    // `event.currentTarget`; build a minimal event-like object so the
    // existing helper continues to work without a separate refactor.
    return this._deleteLedgerLine({ currentTarget: target });
  }

  /**
   * Apply an Eurobucks/IP/Reputation modification to the actor's ledger.
   *
   * The action string is supplied by the V2 action dispatcher (no longer
   * read via `GetEventDatum`), and the form values are read from the live
   * application root (`this.element`) instead of the deprecated
   * `this.form[i]` jQuery accessor.
   *
   * @param {string} action - one of "add", "subtract", "set"
   */
  _updateLedger(action) {
    const valueInput = this.element?.querySelector('input[name="modifyValue"]');
    const reasonInput = this.element?.querySelector('input[name="reason"]');
    const rawValue = valueInput?.value ?? "";
    const reason = reasonInput?.value ?? "";

    if (rawValue === "") {
      SystemUtils.DisplayMessage(
        "warn",
        SystemUtils.Localize("CPR.messages.eurobucksModifyWarn")
      );
      return;
    }

    const value = parseInt(rawValue, 10);
    let actionToApply = action;
    if (Number.isNaN(value)) actionToApply = "error";

    switch (actionToApply) {
      case "add": {
        this.actor.sheet._gainLedger(
          this.propName,
          value,
          `${reason} - ${game.user.name}`
        );
        this.total += value;
        break;
      }
      case "subtract": {
        this.actor.sheet._loseLedger(
          this.propName,
          value,
          `${reason} - ${game.user.name}`
        );
        // If a user puts in a negative number and then hits the Subtract action, the system assumes the user intended to subtract.
        // This is true in cpr-actor-sheet.js --> _loseLedger() and was mimicked from there for consistency;
        if (value <= 0) {
          this.total += value;
        } else {
          this.total -= value;
        }
        break;
      }
      case "set": {
        this.actor.sheet._setLedger(
          this.propName,
          value,
          `${reason} - ${game.user.name}`
        );
        this.total = value;
        break;
      }
      default: {
        SystemUtils.DisplayMessage(
          "error",
          SystemUtils.Localize("CPR.messages.eurobucksModifyInvalidAction")
        );
        break;
      }
    }

    this.contents = foundry.utils.duplicate(
      this.actor.listRecords(this.propName)
    );
    this._makeLedgerReadable(this.propName);
    this.render();
  }

  /**
   * Strip the first word of the string (wealth, reputation, or improvementPoints)
   * to make the ledger more human readable.
   *
   * @param {String} name - Name of the ledger
   */
  _makeLedgerReadable() {
    this.contents.forEach((element, index) => {
      const tmp = element[0].replace(this.propName, "").trim();
      this.contents[index][0] = tmp[0].toUpperCase() + tmp.slice(1);
    });
  }

  /**
   * Delete a single line from the ledger of the actor and re-render the ledger afterwards.
   * This should only be available to the GM, as the button is hidden in the hbs file.
   *
   * @param {Object} event - Event Data contianing the line to delete
   */
  async _deleteLedgerLine(event) {
    const lineId = SystemUtils.GetEventDatum(event, "data-line");
    this.contents = foundry.utils.duplicate(
      this.actor.listRecords(this.propName)
    );
    let numbers = this.contents[lineId][0].match(/\d+/g);
    if (numbers === null) {
      numbers = ["NaN"];
    }
    const promptContent = {
      transaction: this.contents[lineId][0],
      reason: this.contents[lineId][1],
      value: numbers[0],
    };
    // Check if value should also be changed. Show "Ledger Deletion" prompt.
    const confirmDelete = await CPRDialog.showDialog(promptContent, {
      // Set options for dialog.
      title: SystemUtils.Localize("CPR.dialog.ledgerDeletion.title"),
      template: `systems/${game.system.id}/templates/dialog/cpr-ledger-deletion-prompt.hbs`,
      // Define custom buttons for this dialog.
      buttons: {
        yesAdd: {
          icon: "fas fa-check",
          label: SystemUtils.Localize("CPR.dialog.ledgerDeletion.yesAdd"),
          callback: (ev, btn, dlgV2) => {
            const dlg = CPRDialog._resolveFormApplication(ev, btn, dlgV2);
            if (!dlg) return;
            foundry.utils.mergeObject(dlg.object, { action: true, sign: 1 });
            dlg.confirmDialog();
          },
        },
        yesSubtract: {
          icon: "fas fa-check",
          label: SystemUtils.Localize("CPR.dialog.ledgerDeletion.yesSubtract"),
          callback: (ev, btn, dlgV2) => {
            const dlg = CPRDialog._resolveFormApplication(ev, btn, dlgV2);
            if (!dlg) return;
            foundry.utils.mergeObject(dlg.object, {
              action: true,
              sign: -1,
            });
            dlg.confirmDialog();
          },
        },
        no: {
          icon: "fas fa-xmark",
          label: SystemUtils.Localize("CPR.dialog.common.no"),
          callback: (ev, btn, dlgV2) => {
            const dlg = CPRDialog._resolveFormApplication(ev, btn, dlgV2);
            if (!dlg) return;
            foundry.utils.mergeObject(dlg.object, { action: false });
            dlg.confirmDialog();
          },
        },
        cancel: {
          icon: "fas fa-xmark",
          label: SystemUtils.Localize("CPR.dialog.common.cancel"),
          callback: (ev, btn, dlgV2) => {
            const dlg = CPRDialog._resolveFormApplication(ev, btn, dlgV2);
            dlg?.closeDialog();
          },
        },
      },
      buttonDefault: "cancel",
      overwriteButtons: true,
    }).catch((err) => LOGGER.debug(err));
    if (confirmDelete === undefined) {
      return;
    }
    this.contents.splice(lineId, 1);
    const dataPointTransactions = `system.${this.propName}.transactions`;
    const cprActorData = foundry.utils.duplicate(this.actor);
    foundry.utils.setProperty(
      cprActorData,
      dataPointTransactions,
      this.contents
    );
    // Change the value if desired.
    if (confirmDelete.action && numbers[0] !== "NaN") {
      const dataPointValue = `system.${this.propName}.value`;
      const value = foundry.utils.getProperty(cprActorData, dataPointValue);
      foundry.utils.setProperty(
        cprActorData,
        dataPointValue,
        value + confirmDelete.sign * numbers[0]
      );
      // Update ledger application total.
      this.total = value + confirmDelete.sign * numbers[0];
    }
    // Update actor's ledger.
    await this.actor.update(cprActorData);
    this._makeLedgerReadable(this.propName);
    this.render();
  }
}
