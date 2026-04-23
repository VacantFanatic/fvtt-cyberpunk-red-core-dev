/* eslint-disable no-param-reassign */

import BaseMigrationScript from "../base-migration-script.js";

const STATUS_ID_MAP = {
  "cpr-unconcious": "cpr-unconscious",
};

function normalizeStatuses(statuses = []) {
  let changed = false;
  const normalized = statuses.map((status) => {
    const replacement = STATUS_ID_MAP[status];
    if (replacement) changed = true;
    return replacement || status;
  });
  return { normalized, changed };
}

function normalizeEffectList(effects = []) {
  let changed = false;
  for (const effect of effects) {
    if (!Array.isArray(effect.statuses) || effect.statuses.length === 0) continue;
    const { normalized, changed: statusChanged } = normalizeStatuses(
      effect.statuses
    );
    if (!statusChanged) continue;
    effect.statuses = normalized;
    changed = true;
  }
  return changed;
}

export default class NormalizeStatusEffectIds extends BaseMigrationScript {
  static version = 42;

  static name = "Normalize Status Effect IDs";

  async updateItem(itemData) {
    normalizeEffectList(itemData.effects);
  }

  async updateActor(actorData) {
    normalizeEffectList(actorData.effects);
  }
}
