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
   * The base CPRDialog submit handler (run on every form change and flushed again on
   * Confirm) merges raw form fields onto the top level of the dialog object. This
   * dialog needs those fields (bonusRatio, universalBonuses, selectedSkills) folded
   * into `roleData` instead, in the shape `_selectRoleBonuses` (item-sheet.js) expects.
   *
   * @override
   */
  async _flushFormData() {
    await super._flushFormData();

    // Fields may be a single value or an array, depending on how many inputs share
    // the name (checkbox groups) and how many are checked.
    const asArray = (value) =>
      Array.isArray(value) ? value : [value].filter((v) => v);

    // Convert selected skills into a neat list.
    const bonuses = asArray(this.object.selectedSkills)
      .map((s) => this.skillList.find((a) => a.name === s))
      .filter((b) => b);

    // Make sure that we are not dividing by 0 or null/undefined.
    const rawBonusRatio = this.object.bonusRatio;
    const bonusRatio =
      !rawBonusRatio || Number(rawBonusRatio) === 0 ? 1 : rawBonusRatio;

    // Collect relevant data into one object.
    const updatedData = {
      bonusRatio,
      bonuses,
      universalBonuses: asArray(this.object.universalBonuses),
    };

    // Merge above object with our original data.
    // This is then used to update the role item in item-sheet.js (_selectRoleBonuses)
    foundry.utils.mergeObject(this.object.roleData, updatedData);

    // Clean up the raw, flat form fields now that they've been folded into roleData.
    delete this.object.bonusRatio;
    delete this.object.universalBonuses;
    delete this.object.selectedSkills;
  }
}
