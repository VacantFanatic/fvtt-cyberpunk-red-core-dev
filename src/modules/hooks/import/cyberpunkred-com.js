import {
  runImportFlow,
  loadItemDatabases,
} from "../../import/cyberpunkred-com/index.js";
import SystemUtils from "../../utils/cpr-systemUtils.js";
import LOGGER from "../../utils/cpr-logger.js";

function canImport() {
  return game.user.can("FILES_UPLOAD");
}

async function openImportDialog(options = {}) {
  if (!canImport()) return null;
  try {
    if (!game.cpr?.api?.import?.runImportFlow) {
      ui.notifications.error(
        SystemUtils.Localize("CPR.import.cyberpunkredCom.apiUnavailable")
      );
      return null;
    }
    const actor = await runImportFlow(options);
    if (actor) {
      actor.sheet?.render(true);
    }
    return actor;
  } catch (err) {
    LOGGER.error(err);
    ui.notifications.error(
      SystemUtils.Localize("CPR.import.cyberpunkredCom.failed", { name: "" })
    );
    return null;
  }
}

export default function registerCyberpunkRedComImportHooks() {
  Hooks.once("ready", async () => {
    await loadItemDatabases();
  });

  Hooks.on("renderActorDirectory", (app, html) => {
    if (!canImport()) return;
    const element = html instanceof HTMLElement ? html : html[0];
    if (!element) return;
    const headerActions =
      element.querySelector(".header-actions") ??
      element.querySelector(".directory-header .action-buttons");
    if (
      !headerActions ||
      headerActions.querySelector(".cpr-cyberpunkred-com-import")
    ) {
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cpr-cyberpunkred-com-import";
    button.title = SystemUtils.Localize(
      "CPR.import.cyberpunkredCom.directoryButton"
    );
    button.innerHTML = `<i class="fas fa-cloud-download-alt"></i> ${SystemUtils.Localize(
      "CPR.import.cyberpunkredCom.directoryButton"
    )}`;
    button.addEventListener("click", () =>
      openImportDialog({ mode: "create" })
    );
    headerActions.prepend(button);
  });
}
