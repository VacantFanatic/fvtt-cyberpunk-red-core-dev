/* eslint-disable no-param-reassign */

import BaseMigrationScript from "../base-migration-script.js";

export default class ItemQualityMigration extends BaseMigrationScript {
  static version = 26;

  static name = "Item: Quality";

  static documentFilters = {
    Item: { types: [], mixins: ["quality"] },
    Actor: { types: [], mixins: [] },
  };

  async updateItem(doc) {
    const itemName = String(doc.name || "").toLowerCase();
    const itemDescription = String(doc.system?.description?.value || "").toLowerCase();
    const systemData = doc.system || (doc.system = {});

    // Set to jammed on all attackables, not seen if the weapon
    // system.quality != poor but needs to be set.
    systemData.critFailEffect = "jammed";

    if (itemName.includes("poor") || itemDescription.includes("poor")) {
      systemData.quality = "poor";
    } else if (
      itemName.includes("excellent") ||
      itemDescription.includes("excellent")
    ) {
      systemData.quality = "excellent";
    } else {
      systemData.quality = "standard";
    }
  }
}
