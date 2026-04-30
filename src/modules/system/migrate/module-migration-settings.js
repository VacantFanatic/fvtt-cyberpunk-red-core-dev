/* eslint-disable class-methods-use-this */
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class ModuleMigrationSettings extends HandlebarsApplicationMixin(
  ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: "module-migration-config",
    tag: "form",
    position: {
      width: "auto",
      height: "auto",
    },
    window: {
      title: "CPR.settings.moduleMigrationMenu.name",
    },
    form: {
      handler: ModuleMigrationSettings.#onSubmitForm,
      closeOnSubmit: true,
      submitOnChange: false,
    },
  };

  static PARTS = {
    form: {
      template:
        "systems/cyberpunk-red-core/templates/migration/module-migration-settings.hbs",
    },
  };

  /**
   * When this application (read: form window) is launched, create the data object that is
   * consumed by the handle bars template to present options to the user.
   *
   * @override
   * @returns {Object}
   */
  async _prepareContext(options) {
    const data = await super._prepareContext(options);

    const moduleIdSet = new Set(
      game.settings.get(game.system.id, "moduleMigrationIds")
    );
    data.selectedMods = Array.from(moduleIdSet);

    data.modules = {};
    const compendiaTypes = ["Actor", "Item", "Scene"];

    // Gather modules with relevant compendia.
    game.modules.forEach((module) => {
      const filteredPacks = module.packs.filter((p) =>
        compendiaTypes.includes(p.type)
      );
      if (filteredPacks.size === 0) return;
      data.modules[module.id] = module.title;
    });

    return data;
  }

  /**
   * Called when the sub menu application (this thing) is submitted. Responsible for updating
   * internal settings with what the user chose.
   *
   * @async
   * @override
   * @param {*} event (not used here)
   * @param {Object} formData - object containing module ids corresponding to choices
   */
  static async #onSubmitForm(_event, _form, formData) {
    const expandedData = foundry.utils.expandObject(formData.object);
    const { modIds: submittedModIds } = expandedData;
    let modIds = submittedModIds;

    // Cast to an array if not.
    if (!Array.isArray(modIds)) modIds = [modIds];
    const modIdList = modIds.filter((id) => id); // remove null values
    await game.settings.set(game.system.id, "moduleMigrationIds", modIdList);
  }
}
