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

/**
 * Migration 044 converted legacy mode -> type on existing world documents,
 * but the system-provided compendium packs themselves still shipped the
 * legacy shape until it was fixed directly in the pack source (see
 * scripts/fix-legacy-active-effect-mode.mjs). Any item dragged from a
 * compendium into a world between migration 044 running and that pack fix
 * landing still carries a type-less `mode`, which Foundry V14 does not
 * handle for direct `system.*` keys (e.g. stat increments were applied as
 * string concatenation instead of addition). Re-running the same,
 * idempotent conversion here catches that data.
 */
export default class RecheckActiveEffectChangeTypeMigration extends BaseMigrationScript {
  static version = 45;

  static name =
    "Active Effect changes: re-check legacy mode to string type (compendium items imported after #044)";

  async updateItem(itemData) {
    migrateEffectChanges(itemData.effects);
  }

  async updateActor(actorData) {
    migrateEffectChanges(actorData.effects);
  }
}
