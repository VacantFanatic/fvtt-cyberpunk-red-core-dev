/**
 * Orchestrates a full character import onto a Foundry actor.
 * Adapted from cyberpunkred-importer (MIT, Aaron Olkin).
 */
/* global QuickInsert */

import { updateLifepath } from "./lifepath.js";
import { updateStats } from "./stats.js";
import { updateSkills } from "./skills.js";
import { importItems, importItemsV2 } from "./items.js";
import LOGGER from "../../utils/cpr-logger.js";

const CHARACTER_TYPE_MAP = {
  0: "Character",
  1: "NPC",
};

export function isV2Character(character) {
  return character.version === 2;
}

export function getCharacterType(character) {
  if (isV2Character(character)) {
    return character.characterType;
  }
  return CHARACTER_TYPE_MAP[character.character_type_id];
}

export function isNpcExport(data) {
  return data.character_type_id === 1 || data.characterType === "NPC";
}

function isQuickInsertAvailable() {
  return window.QuickInsert !== undefined;
}

function isUsingMookSheet(actor) {
  const currentSheetClass =
    actor?.flags?.core?.sheetClass ||
    game.settings.get("core", "sheetClasses")?.Actor?.[actor.type];
  return currentSheetClass === `${game.system.id}.CPRMookActorSheet`;
}

export async function importCharacter(data, actor) {
  if (actor.type !== "character" && actor.type !== "mook") {
    throw new Error("Can only import to characters and mooks");
  }

  const originalSheetClass = actor?.flags?.core?.sheetClass ?? "";
  const mustReconfigureSheetClass = isUsingMookSheet(actor);
  if (mustReconfigureSheetClass) {
    await actor.update({
      flags: {
        core: { sheetClass: `${game.system.id}.CPRCharacterActorSheet` },
      },
    });
  }

  const forWhom = `${data.name}`;
  const isV2 = isV2Character(data);

  try {
    await updateLifepath(data, actor);
    ui.notifications.info(
      game.i18n.format("CPR.import.cyberpunkredCom.importingSkills", {
        name: forWhom,
      })
    );
    await updateSkills(data, actor, isV2);
    if (isV2) {
      if (isQuickInsertAvailable()) {
        ui.notifications.info(
          game.i18n.format("CPR.import.cyberpunkredCom.importingItems", {
            name: forWhom,
          })
        );
        if (!QuickInsert.hasIndex) {
          await QuickInsert.forceIndex();
        }
        await importItemsV2(data, actor);
      } else {
        ui.notifications.warn(
          game.i18n.localize("CPR.import.cyberpunkredCom.quickInsertRequired")
        );
      }
    } else {
      ui.notifications.info(
        game.i18n.format("CPR.import.cyberpunkredCom.importingItems", {
          name: forWhom,
        })
      );
      await importItems(data, actor);
    }
    await updateStats(data, actor, isV2);

    if (isV2) {
      if (isQuickInsertAvailable()) {
        ui.notifications.info(
          game.i18n.format("CPR.import.cyberpunkredCom.doneV2", {
            name: forWhom,
          })
        );
      } else {
        ui.notifications.info(
          game.i18n.format("CPR.import.cyberpunkredCom.doneV2NoItems", {
            name: forWhom,
          })
        );
      }
    } else {
      ui.notifications.info(
        game.i18n.format("CPR.import.cyberpunkredCom.doneV1", { name: forWhom })
      );
    }
  } catch (e) {
    ui.notifications.error(
      game.i18n.format("CPR.import.cyberpunkredCom.failed", { name: forWhom })
    );
    LOGGER.error(e);
    throw e;
  } finally {
    if (mustReconfigureSheetClass) {
      await actor.update({
        flags: { core: { sheetClass: originalSheetClass } },
      });
    }
  }
}
