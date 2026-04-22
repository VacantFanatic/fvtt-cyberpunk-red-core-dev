/* eslint-disable no-await-in-loop, no-use-before-define, no-continue, prefer-destructuring */
/* global PreciseText, PIXI */
import AdditionsUtils from "./utils.js";
import { ADDITIONS_SETTINGS, WEAPON_TYPE_LIST } from "./constants.js";

const SHOWN_WEAPONS = [];

export default class DvDisplay {
  static async show() {
    if (
      !game.settings.get(game.system.id, ADDITIONS_SETTINGS.showDvDisplay) ||
      (game.settings.get(
        game.system.id,
        ADDITIONS_SETTINGS.dvDisplayOnlyInCombat
      ) &&
        !game.combat?.started)
    ) {
      return;
    }

    if (!this.dvDisplay?.parent) this.addChild(this.dvDisplay);

    const controlledToken = canvas.tokens.controlled[0];
    if (!controlledToken || controlledToken === this) return;

    const distance = AdditionsUtils.getDistance(controlledToken, this);
    const showWeaponNames = game.settings.get(
      game.system.id,
      ADDITIONS_SETTINGS.showWeaponNamesInDvDisplay
    );

    let displayText = "";
    let lines = 0;

    for (const item of controlledToken.actor.items) {
      if (
        item.system.isRanged &&
        (item.system.equipped === "equipped" ||
          (item.type === "cyberware" && item.system.isInstalled)) &&
        item.system.dvTable
      ) {
        const dv = await AdditionsUtils.getDV(item.system.dvTable, distance);
        if (dv > -1) {
          const row = generateDisplayText(item, showWeaponNames, dv);
          if (row) {
            lines += 1;
            displayText += row;
          }
        }

        if (item.system?.upgrades?.length > 0) {
          for (const upgrade of item.system.upgrades) {
            if (upgrade.system.type !== "weapon") continue;
            const upgradeDocument = controlledToken.actor.items.get(
              upgrade._id
            );
            if (
              !upgradeDocument ||
              !upgradeDocument.system.isRanged ||
              !upgradeDocument.system.isInstalled ||
              !upgradeDocument.system.dvTable
            ) {
              continue;
            }
            const upgradeDv = await AdditionsUtils.getDV(
              upgradeDocument.system.dvTable,
              distance
            );
            if (upgradeDv > -1) {
              const row = generateDisplayText(
                upgradeDocument,
                showWeaponNames,
                upgradeDv
              );
              if (row) {
                lines += 1;
                displayText += row;
              }
            }
          }
        }

        if (item.system.fireModes.suppressiveFire) {
          const autoDv = await AdditionsUtils.getDV(
            `${item.system.dvTable} (Autofire)`,
            distance
          );
          if (autoDv > -1) {
            const row = generateDisplayText(
              item,
              showWeaponNames,
              autoDv,
              true
            );
            if (row) {
              lines += 1;
              displayText += row;
            }
          }
        }
      }
    }

    if (lines === 0) return;

    const position = game.settings.get(
      game.system.id,
      ADDITIONS_SETTINGS.dvDisplayPosition
    );
    this.dvDisplay?.removeChildren()?.forEach((entry) => entry.destroy());

    const style = CONFIG.canvasTextStyle.clone();
    style.align = position === "right" ? "left" : "right";

    const text = new PreciseText(displayText, style);
    text.anchor.set(1, 0);
    this.dvDisplay.addChild(text);

    if (position === "right") {
      this.dvDisplay.position.set(this.w + this.dvDisplay.width + 15, 0);
    } else {
      this.dvDisplay.position.set(-15, 0);
    }

    SHOWN_WEAPONS.splice(0, SHOWN_WEAPONS.length);
  }

  static clear() {
    this.dvDisplay?.removeChildren()?.forEach((entry) => entry.destroy());
  }

  static async registerWrapper(wrapped, ...args) {
    await wrapped(...args);
    this.dvDisplay = this.addChild(new PIXI.Container());
    return this;
  }
}

function generateDisplayText(item, showWeaponNames, dv, autofire = false) {
  let name = item.name;
  let duplicateKey = item.name;
  if (!showWeaponNames) {
    name = game.i18n.localize(WEAPON_TYPE_LIST[item.system.weaponType]);
    duplicateKey = item.system.weaponType;
  }

  if (autofire) {
    name += " (Autofire)";
    duplicateKey += " (Autofire)";
  }

  if (SHOWN_WEAPONS.includes(duplicateKey)) return "";
  SHOWN_WEAPONS.push(duplicateKey);

  return game.i18n.format("CPR.additions.dvDisplay.row", {
    "weapon-name": name,
    "dv-value": dv,
  });
}
