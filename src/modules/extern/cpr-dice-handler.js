import { resolveDiceRollVisibility } from "./cpr-dice-roll-mode.js";

/**
 * We use custom chat cards for dice rolls, so we have to override the dice card behaviours
 * provided by 3rd party dice rollers. We currently support Dice So Nice! and DDDice.
 *
 * See https://github.com/JDWarner/dice-so-nice/wiki/Roll
 */
export default class DiceHandler {
  static #diceQueue = Promise.resolve();

  static async handle3dDice(roll, rollModeOverride) {
    if (!roll) return;

    const dsnActive = game.modules.get("dice-so-nice")?.active;
    const dddiceActive = game.modules.get("dddice")?.active;
    if (!dsnActive && !dddiceActive) return;
    if (!game.dice3d) return;

    DiceHandler.#diceQueue = DiceHandler.#diceQueue.then(() =>
      DiceHandler._passRoll(roll, rollModeOverride)
    );
    await DiceHandler.#diceQueue;
  }

  /**
   * Massage the roll object with properties like the 3d dice rollers expect
   *
   * @param {CPRRoll} roll - a roll object
   * @param {Object} rollModeOverride - an object with overriding parameters
   */
  static async _passRoll(roll, rollModeOverride) {
    const rollMode =
      rollModeOverride || game.settings.get("core", "messageMode");
    const { whisper, blind } = resolveDiceRollVisibility(rollMode);
    return game.dice3d.showForRoll(roll, game.user, true, whisper, blind);
  }
}
