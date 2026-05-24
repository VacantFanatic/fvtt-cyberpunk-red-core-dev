/**
 * cyberpunkred.com character import — public API.
 * Adapted from cyberpunkred-importer (MIT, Aaron Olkin).
 */

import loadCharacter from "./firebase.js";
import { importCharacter, isNpcExport } from "./import-character.js";
import { loadItemDatabases } from "./items.js";
import CyberpunkRedComImportDialog from "./import-dialog.js";
import LOGGER from "../../utils/cpr-logger.js";

export { loadCharacter, loadItemDatabases, importCharacter };

/**
 * @returns {Promise<{code: string, data: object}|null>}
 */
export async function showImportDialog(options = {}) {
  return CyberpunkRedComImportDialog.prompt(options);
}

/**
 * Fetch export data for a six-character code.
 * @param {string} code
 */
export async function fetchCharacter(code) {
  return loadCharacter(code.toUpperCase());
}

/**
 * Create a new actor and import export data onto it.
 * @param {string} code
 * @returns {Promise<Actor>}
 */
export async function createAndImport(code) {
  const data = await fetchCharacter(code);
  const actor = await Actor.create({
    name: data.handle || data.name,
    type: isNpcExport(data) ? "mook" : "character",
  });
  await importCharacter(data, actor);
  return actor;
}

/**
 * Run the import dialog then create or update an actor.
 * @param {object} [options]
 * @param {"create"|"import"} [options.mode]
 * @param {Actor} [options.actor]
 * @returns {Promise<Actor|null>}
 */
export async function runImportFlow(options = {}) {
  const result = await showImportDialog(options);
  if (!result?.data) return null;

  const { data, mode, actor: targetActor } = result;
  let actor = targetActor;
  try {
    if (mode === "create" || !actor) {
      actor = await Actor.create({
        name: data.handle || data.name,
        type: isNpcExport(data) ? "mook" : "character",
      });
    }

    ui.notifications.info(
      game.i18n.format("CPR.import.cyberpunkredCom.importingCharacter", {
        name: data.name,
      })
    );
    await importCharacter(data, actor);
    return actor;
  } catch (err) {
    LOGGER.error(err);
    ui.notifications.error(
      game.i18n.format("CPR.import.cyberpunkredCom.failed", {
        name: data.name ?? "",
      })
    );
    throw err;
  }
}
