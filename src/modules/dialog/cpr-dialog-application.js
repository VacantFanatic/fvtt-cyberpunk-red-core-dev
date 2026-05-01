import LOGGER from "../utils/cpr-logger.js";
import SystemUtils from "../utils/cpr-systemUtils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Base dialog application used by most CPR prompt windows.
 */
export default class CPRDialog extends HandlebarsApplicationMixin(
  ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: "cpr-dialog",
    classes: ["dialog"],
    tag: "form",
    position: {
      width: 400,
      height: "auto",
    },
    window: {
      resizable: true,
      title: "CPR.global.generic.title",
    },
    form: {
      handler: CPRDialog.#onSubmitForm,
      submitOnChange: true,
      closeOnSubmit: false,
    },
    buttonDefault: "confirm",
    buttons: {
      confirm: {
        icon: "fas fa-check",
        label: "CPR.dialog.common.confirm",
        callback: CPRDialog.#onConfirm,
      },
      cancel: {
        icon: "fas fa-xmark",
        label: "CPR.dialog.common.cancel",
        callback: CPRDialog.#onCancel,
      },
    },
    overwriteButtons: false,
    actions: {
      dialogButton: CPRDialog.#onDialogButton,
      itemCheckboxToggle: CPRDialog.#onItemCheckboxToggle,
      selectInput: CPRDialog.#onSelectInput,
      closeDialog: CPRDialog.#onCloseAction,
    },
  };

  static PARTS = {
    form: {
      // Must not use `game.system.id` here: static fields run while the module loads, before `game` exists.
      template:
        "systems/cyberpunk-red-core/templates/dialog/cpr-default-prompt.hbs",
    },
  };

  constructor(dialogData, options = {}) {
    // Application V2 freezes `this.options` after `super()`. Standard option
    // keys (`window.title`, `buttons`, ...) need to be merged BEFORE super.
    // Per-instance template overrides are NOT routed through options because
    // V2 treats `options.parts` as an array of part NAMES, not a definition
    // map; the actual template is swapped via `_configureRenderParts` below
    // using the `_templateOverride` instance field set after `super()`.
    const overrides = {};
    if (options.title) {
      overrides.window = { title: options.title };
    }
    if (options.overwriteButtons && options.buttons) {
      overrides.buttons = options.buttons;
    }
    const mergedOptions = foundry.utils.mergeObject(options, overrides, {
      inplace: false,
    });
    super(mergedOptions);
    this.dialogData = dialogData;
    this.objectData = dialogData?.object;
    this._templateOverride = options.template ?? null;

    if (this.options?.buttons) {
      Object.keys(this.options.buttons).forEach((buttonName) => {
        const dialogButton = this.options.buttons[buttonName];
        if (dialogButton?.label?.startsWith?.("CPR.")) {
          dialogButton.label = SystemUtils.Localize(dialogButton.label);
        }
      });
    }
  }

  /**
   * Inject any per-instance template override (e.g. a roll prompt template)
   * into the merged PARTS map. Application V2 freezes `this.options`, so this
   * is the only safe place to swap the rendered template after construction.
   *
   * @param {ApplicationRenderOptions} options
   * @returns {Record<string, object>}
   */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    if (this._templateOverride && parts?.form) {
      return {
        ...parts,
        form: { ...parts.form, template: this._templateOverride },
      };
    }
    return parts;
  }

  get object() {
    return this.dialogData;
  }

  /**
   * Compatibility helper used by existing callbacks in child dialogs.
   *
   * @param {PointerEvent|SubmitEvent|CPRDialog} event
   * @param {HTMLButtonElement} [button]
   * @param {*} [dialogV2]
   * @returns {CPRDialog|undefined}
   */
  static _resolveFormApplication(event, button, dialogV2) {
    if (event && typeof event.confirmDialog === "function") {
      return /** @type {CPRDialog} */ (event);
    }
    const parent = dialogV2?.parent;
    if (parent && typeof parent.confirmDialog === "function") {
      return /** @type {CPRDialog} */ (parent);
    }

    /** @param {string|null|undefined} id */
    const byWindowId = (id) => {
      if (!id || typeof id !== "string") return undefined;
      const fromUi = ui?.windows?.[id];
      if (fromUi && typeof fromUi.confirmDialog === "function") {
        return /** @type {CPRDialog} */ (fromUi);
      }
      const fromV2 = foundry.applications?.instances?.get?.(id);
      if (fromV2 && typeof fromV2.confirmDialog === "function") {
        return /** @type {CPRDialog} */ (fromV2);
      }
      return undefined;
    };

    const walkIds = (root) => {
      let node = root;
      while (node) {
        if (node.id) {
          const app = byWindowId(node.id);
          if (app) return app;
        }
        node = node.parentElement;
      }
      return undefined;
    };

    const fromBtn = walkIds(button?.form ?? null);
    if (fromBtn) return fromBtn;

    const fromDlg = walkIds(dialogV2?.element ?? null);
    if (fromDlg) return fromDlg;

    return undefined;
  }

  static #onSelectInput(event) {
    event.currentTarget?.select?.();
  }

  static #onItemCheckboxToggle(event) {
    const dialogData = this.object;
    const target = SystemUtils.GetEventDatum(event, "data-target");
    const value = !foundry.utils.getProperty(dialogData, target);
    if (foundry.utils.hasProperty(dialogData, target)) {
      foundry.utils.setProperty(dialogData, target, value);
    } else {
      LOGGER.error(
        `The target (${target}) does not exist in the dialogData.`,
        dialogData
      );
    }
    this.render(true);
  }

  static #onDialogButton(event, target) {
    event.preventDefault();
    const buttonName = target.name;
    const button = this.options.buttons?.[buttonName];
    if (!button?.callback) return;
    button.callback(this);
  }

  static #onCloseAction(event) {
    event.preventDefault();
    this.closeDialog();
  }

  static #onConfirm(dialog) {
    return dialog?.confirmDialog();
  }

  static #onCancel(dialog) {
    return dialog?.closeDialog();
  }

  static async #onSubmitForm(_event, _form, formData) {
    const fd = foundry.utils.duplicate(formData.object);
    foundry.utils.mergeObject(this.object, fd);
    this.render(true);
  }

  async _prepareContext(options) {
    const data = await super._prepareContext(options);
    Object.entries(this.object ?? {}).forEach(([key, value]) => {
      data[key] = value;
    });
    // V1 dialogs got `this.options` merged into the template scope for free.
    // V2 only forwards what `_prepareContext` returns, so re-expose the
    // option keys that the dialog HBS templates read explicitly
    // (cpr-default-prompt.hbs, cpr-dialog-buttons.hbs, etc.).
    data.options = {
      buttons: this.options.buttons,
      buttonDefault: this.options.buttonDefault,
    };
    return data;
  }

  static get defaultOptions() {
    const options = foundry.utils.mergeObject(super.defaultOptions, {
      window: {
        title: "CPR.global.generic.title",
      },
      position: {
        width: 400,
        height: "auto",
      },
      form: {
        submitOnChange: true,
        closeOnSubmit: false,
      },
      buttonDefault: "confirm",
      buttons: {
        confirm: {
          icon: "fas fa-check",
          label: "CPR.dialog.common.confirm",
          callback: CPRDialog.#onConfirm,
        },
        cancel: {
          icon: "fas fa-xmark",
          label: "CPR.dialog.common.cancel",
          callback: CPRDialog.#onCancel,
        },
      },
      overwriteButtons: false,
    });
    if (options?.buttons) {
      Object.keys(options.buttons).forEach((buttonName) => {
        const dialogButton = options.buttons[buttonName];
        if (dialogButton?.label?.startsWith?.("CPR.")) {
          dialogButton.label = SystemUtils.Localize(dialogButton.label);
        }
      });
    }
    return options;
  }

  async getData() {
    return this._prepareContext({});
  }

  activateListeners(html) {
    super.activateListeners?.(html);
  }

  async confirmDialog(_event, options) {
    // Taken from Starfinder: Fire callback that resolves original promise.
    this._confirmDialog?.();
    return this.close(options);
  }

  /**
   * This will cancel/close the roll and reject the Promise originally created when CPRDialog.showDialog is called.
   *
   * @param {Object} options - potential options to pass to this.close; currently unused;
   */
  async closeDialog(_event, options) {
    this._closeDialog?.();
    return this.close(options);
  }

  /**
   * Creates a promise to be resolved when the dialog is confirmed. One can also override default options here.
   *
   * Callbacks are stored on the instance (not on `this.options`, which is frozen
   * by Application V2).
   *
   * @param {...args<Object>} - The first argument should be the object that is being changed by the dialog.
   *                          - The final argument (optional) is options to pass to the dialog.
   *                          - See defaultOptions for a breakdown of these options.
   *                          - See constructors to know how many arguments each dialog Class expects.
   */
  static async showDialog(...args) {
    return new Promise((resolve, reject) => {
      const dialog = new this(...args);
      dialog._confirmDialog = () => resolve(args[0]);
      dialog._closeDialog = () => reject(args[0]);
      dialog.render(true);
    });
  }
}
