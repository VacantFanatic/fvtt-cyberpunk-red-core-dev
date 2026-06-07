/**
 * Regression tests for Dice So Nice roll visibility mapping.
 * Run: node .github/workflows/pipeline_tests/test-dice-roll-mode.mjs
 */
import assert from "node:assert/strict";

global.game = {
  user: { id: "user1" },
  users: {
    filter(fn) {
      return [
        { id: "gm1", isGM: true },
        { id: "gm2", isGM: true },
        { id: "user2", isGM: false },
      ].filter(fn);
    },
  },
};

const { resolveDiceRollVisibility } = await import(
  "../../../src/modules/extern/cpr-dice-roll-mode.js"
);

assert.deepEqual(resolveDiceRollVisibility("roll"), {
  whisper: undefined,
  blind: false,
});

assert.deepEqual(resolveDiceRollVisibility("blindroll"), {
  whisper: undefined,
  blind: true,
});

assert.deepEqual(resolveDiceRollVisibility("selfroll"), {
  whisper: ["user1"],
  blind: false,
});

assert.deepEqual(resolveDiceRollVisibility("gmroll"), {
  whisper: ["gm1", "gm2"],
  blind: false,
});

console.log("✅ dice roll mode regression tests passed");
