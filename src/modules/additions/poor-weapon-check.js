import { ADDITIONS_SETTINGS } from "./constants.js";

export default function registerPoorWeaponCheck() {
  Hooks.on("createChatMessage", async (message) => {
    if (
      message.author?.id !== game.user.id ||
      !game.settings.get(game.system.id, ADDITIONS_SETTINGS.poorWeaponCheck)
    ) {
      return;
    }
    const div = document.createElement("div");
    div.innerHTML = message.content;
    const isAttack = div.querySelector(
      `[data-tooltip='${game.i18n.localize(
        "CPR.actorSheets.commonActions.rollDamage"
      )}']`
    );
    const data = div.querySelector("[data-action=rollDamage]")?.dataset;
    if (!isAttack || !data) return;

    const isFail = div
      .querySelector(".d10")
      ?.getAttribute("src")
      ?.includes("d10_1_fail.svg");
    if (!isFail) return;

    const token =
      message.speaker?.token ??
      canvas.scene.tokens.get(data.tokenId) ??
      canvas.scene.tokens.getName(message.speaker?.alias);
    const actor = token?.actor ?? game.actors.get(data.actorId);
    const item = actor?.items?.get(data.itemId);
    if (!token || !actor || !item) return;

    const name = item.name.toLowerCase();
    const poorIndicator = game.i18n
      .localize("CPR.additions.poorWeaponCheck.wordIndicator")
      .toLowerCase();
    const isPoorWeapon =
      item.system.quality === "poor" ||
      name.includes("(poor)") ||
      name.includes(poorIndicator);
    if (!isPoorWeapon) return;

    const keyMap = {
      destroyed: "CPR.additions.poorWeaponCheck.breakWeapon",
      destroyedBeyondRepair: "CPR.additions.poorWeaponCheck.breakBeyondWeapon",
      jammed: "CPR.additions.poorWeaponCheck.jamWeapon",
      coinToss: "CPR.additions.poorWeaponCheck.coinToss",
    };
    const i18nKey = keyMap[item.system.critFailEffect];
    if (!i18nKey) return;

    await ChatMessage.create(
      {
        speaker: message.speaker,
        content: game.i18n.format(i18nKey, {
          attacker: token.name,
          weapon: item.name,
        }),
        type: message.type,
        whisper: message.whisper,
      },
      { chatBubble: false }
    );
  });
}
