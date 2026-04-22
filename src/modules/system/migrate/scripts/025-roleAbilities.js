/* eslint-disable no-param-reassign */

import BaseMigrationScript from "../base-migration-script.js";

export default class RoleAbilityNaNMigration extends BaseMigrationScript {
  static version = 25;

  static name = "Role - NaN Multiplier";

  static documentFilters = {
    Item: { types: ["role"], mixins: [] },
    Actor: { types: [], mixins: [] },
  };

  async updateItem(doc) {
    const abilities = doc.system?.abilities;
    if (!Array.isArray(abilities) || abilities.length === 0) return;
    const nanAbilities = abilities.filter((a) =>
      Number.isNaN(a.multiplier)
    );
    for (const ability of nanAbilities) {
      ability.multiplier = 1;
    }
  }
}
