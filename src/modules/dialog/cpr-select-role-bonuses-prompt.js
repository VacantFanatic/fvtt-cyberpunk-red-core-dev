/* eslint-disable max-classes-per-file */
/* eslint-disable no-shadow */
import SystemUtils from "../utils/cpr-systemUtils.js";
import CPRDialog from "./cpr-dialog-application.js";

export default class SelectRoleBonuses extends CPRDialog {
  /**
   * dialogData.roleData will either contain roleItem.system or roleItem.system.someSubAbility.
   *
   * @param {Object} dialogData - Data for the form. Includes a skill list and information from the role.
   * @constructor
   */
  constructor(dialogData, options = {}) {
    // Apply template + title via options (merged before super) to honor
    // the Application V2 frozen-options contract.
    const merged = foundry.utils.mergeObject(
      options,
      {
        template: `systems/${game.system.id}/templates/dialog/cpr-select-role-bonuses-prompt.hbs`,
        title: SystemUtils.Localize("CPR.dialog.selectRoleBonuses.title"),
      },
      { inplace: false }
    );
    super(dialogData, merged);
    this.skillList = dialogData.skillList;
    this.roleData = dialogData.roleData;
  }

  /**
   * Prepares data for roll dialog sheet.
   *
   * @override
   */
  async _prepareContext(options) {
    const data = await super._prepareContext(options);
    data.skillList = this.skillList;
    data.roleData = this.roleData;
    return data;
  }

  /**
   * Processes the form's data in a way that is useful to us.
   *
   * @param {*} event - currently not used.
   * @param {Object} formData - Data from the submitted form.
   * @override
   */
  async _updateObject(event, formData) {
    // Convert selected skills into a neat list.
    const bonuses = [];
    formData.selectedSkills.forEach((s) => {
      if (s) bonuses.push(this.skillList.find((a) => a.name === s));
    });

    // Make sure that we are not dividing by 0 or null/undefined.
    const bonusRatio =
      !formData.bonusRatio || formData.bonusRatio === 0
        ? 1
        : formData.bonusRatio;

    // Collect relevant data into one object.
    const updatedData = {
      bonusRatio,
      bonuses,
      universalBonuses: formData.universalBonuses.filter((b) => b),
    };

    // Merge above object with our original data.
    // This is then used to update the role item in item-sheet.js (_selectRoleBonuses)
    foundry.utils.mergeObject(this.object.roleData, updatedData);
    this.render(true); // rerenders the FormApp with the new data.
  }
}
