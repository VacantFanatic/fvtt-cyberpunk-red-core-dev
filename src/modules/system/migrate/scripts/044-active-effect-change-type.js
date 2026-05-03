/* eslint-disable no-param-reassign, class-methods-use-this */

import BaseMigrationScript from "../base-migration-script.js";

const LEGACY_MODE_TO_TYPE = {
  0: "custom",
  1: "multiply",
  2: "add",
  3: "downgrade",
  4: "upgrade",
  5: "override",
};

function migrateEffectChanges(effects) {
  if (!Array.isArray(effects)) return;
  for (const effect of effects) {
    if (Array.isArray(effect.changes)) {
      for (const ch of effect.changes) {
        if (ch.mode !== undefined) {
          if (ch.type == null || String(ch.type).trim() === "") {
            ch.type = LEGACY_MODE_TO_TYPE[ch.mode] ?? "add";
          }
          delete ch.mode;
        }
      }
    }
  }
}

export default class ActiveEffectChangeTypeMigration extends BaseMigrationScript {
  static version = 44;

  static name =
    "Active Effect changes: legacy mode to string type (Foundry V14+)";

  async updateItem(itemData) {
    migrateEffectChanges(itemData.effects);
  }

  async updateActor(actorData) {
    migrateEffectChanges(actorData.effects);
  }
}
