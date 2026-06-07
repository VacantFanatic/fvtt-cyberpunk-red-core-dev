/**
 * Map Foundry roll mode settings to Dice So Nice showForRoll whisper/blind args.
 *
 * @param {string} rollMode - core messageMode value
 * @returns {{ whisper: string[]|null|undefined, blind: boolean }}
 */
export function resolveDiceRollVisibility(rollMode) {
  switch (rollMode) {
    case "blindroll":
      return { whisper: undefined, blind: true };
    case "gmroll":
      return {
        whisper: game.users.filter((user) => user.isGM).map((gm) => gm.id),
        blind: false,
      };
    case "selfroll":
      return { whisper: [game.user.id], blind: false };
    case "roll":
    default:
      // Public rolls: leave whisper empty so every connected client can see (DsN API).
      return { whisper: undefined, blind: false };
  }
}
