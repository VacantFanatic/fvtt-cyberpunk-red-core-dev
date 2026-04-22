/* global Sequence */
import AdditionsUtils from "./utils.js";
import { ADDITIONS_SETTINGS } from "./constants.js";

export default function registerDoesItHit() {
  Hooks.on("createChatMessage", async (message) => {
    if (message.author?.id !== game.user.id) return;

    const div = document.createElement("div");
    div.innerHTML = message.content;
    const isAttack = div.querySelector(
      `[data-tooltip='${game.i18n.localize(
        "CPR.actorSheets.commonActions.rollDamage"
      )}']`
    );
    const data = div.querySelector("[data-action=rollDamage]")?.dataset;
    if (!isAttack || !data) return;

    const attackType = div
      .querySelector("div.rollcard-subtitle-center.text-small")
      ?.innerHTML?.trim();
    if (attackType === game.i18n.localize("CPR.rolls.suppressiveFire")) return;

    const target = message.author?.targets?.first();
    if (!target) return;

    let token =
      message.speaker?.token ??
      canvas.scene.tokens.get(data.tokenId) ??
      canvas.scene.tokens.getName(message.speaker?.alias);
    const actor = token?.actor ?? game.actors.get(data.actorId);
    if (actor && !token)
      token = canvas.scene.tokens.getName(actor.prototypeToken.name);
    const item = actor?.items?.get(data.itemId);
    if (!token || !actor || !item) return;

    const attackRoll = Number.parseInt(
      div.querySelector("span.clickable[data-action='toggleVisibility']")
        ?.innerHTML,
      10
    );
    let dvTable = item.system?.dvTable;
    if (!dvTable) return;
    if (
      attackType === game.i18n.localize("CPR.global.itemType.skill.autofire")
    ) {
      dvTable = `${dvTable} (Autofire)`;
    }

    const distance = AdditionsUtils.getDistance(token, target);
    const dv = await AdditionsUtils.getDV(dvTable, distance);
    if (dv < 0) return;

    const targetActor = target.document?._actor ?? target.document?.actor;
    const replaceMap = {
      attacker: token.name,
      target: target.document.name,
      dv,
      "dv-diff": attackRoll - dv,
      "dv-diff+1": dv - attackRoll + 1,
      "dv-diff-1": attackRoll - 1 - dv,
    };

    let key = "";
    let success = false;
    if (dv >= attackRoll) {
      key =
        targetActor?.system?.stats?.ref?.value >= 8
          ? "CPR.additions.message.missed.evade"
          : "CPR.additions.message.missed.normal";
    } else {
      success = true;
      key =
        targetActor?.system?.stats?.ref?.value >= 8
          ? "CPR.additions.message.hit.evade"
          : "CPR.additions.message.hit.normal";
    }

    if (window.Sequence) {
      const sequence = new Sequence();
      if (
        success &&
        game.settings.get(game.system.id, ADDITIONS_SETTINGS.hitSounds)
      ) {
        const sounds = game.settings.get(
          game.system.id,
          ADDITIONS_SETTINGS.configuredSounds
        );
        if (sounds.length > 0) {
          sequence
            .sound()
            .delay(1000)
            .file(sounds[Math.floor(Math.random() * sounds.length)])
            .volume(0.35)
            .locally(message.whisper.length !== 0);
        }
      }
      if (game.settings.get(game.system.id, ADDITIONS_SETTINGS.hitAnimations)) {
        const usePatreon = game.settings.get(
          game.system.id,
          ADDITIONS_SETTINGS.useJb2aPatreon
        );
        const missPath = usePatreon
          ? "modules/jb2a_patreon/Library/Generic/UI/Miss_01_Red_200x200.webm"
          : "modules/JB2A_DnD5e/Library/Generic/UI/Miss_02_White_200x200.webm";
        const hitPath = usePatreon
          ? "modules/jb2a_patreon/Library/Generic/Weapon_Attacks/Melee/DmgBludgeoning_01_Regular_Yellow_2Handed_800x600.webm"
          : "modules/JB2A_DnD5e/Library/Generic/Impact/Impact_07_Regular_Orange_400x400.webm";
        if (!success) {
          sequence
            .effect()
            .delay(1000)
            .file(missPath)
            .snapToGrid()
            .atLocation(token, { gridUnits: true, offset: { x: 0, y: -0.55 } })
            .scaleToObject(1.35)
            .locally(message.whisper.length !== 0);
        } else {
          const angle =
            (360 +
              Math.atan2(target.y - token.y, target.x - token.x) *
                (180 / Math.PI)) %
            360;
          sequence
            .effect()
            .delay(250)
            .file(hitPath)
            .atLocation(target, {
              offset: {
                x: -Math.cos((angle * Math.PI) / 180),
                y: -Math.sin((angle * Math.PI) / 180),
              },
              gridUnits: true,
            })
            .rotate(angle * -1)
            .locally(message.whisper.length !== 0);
        }
      }
      sequence.play();
    }

    await ChatMessage.create(
      {
        speaker: message.speaker,
        content: game.i18n.format(key, replaceMap),
        type: message.type,
        whisper: message.whisper,
      },
      { chatBubble: false }
    );
  });
}
