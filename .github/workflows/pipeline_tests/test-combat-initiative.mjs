/**
 * Regression tests for #95/#96 combat initiative fixes:
 *  - CPRCombat._getInitiativeFormula() must not treat a legitimate best
 *    initiative of 0 the same as "nobody has rolled yet" (falsy-zero bug).
 *  - CPRCombat#rollInitiative() must skip a combatant the current user
 *    doesn't own, not abort the rest of the batch.
 *
 * Run: node .github/workflows/pipeline_tests/test-combat-initiative.mjs
 */
import assert from "node:assert/strict";

global.Combat = class {};
global.foundry = {
  utils: {
    mergeObject: (a, b) => ({ ...a, ...b }),
    duplicate: (o) => JSON.parse(JSON.stringify(o)),
  },
  applications: {
    api: {
      ApplicationV2: class {},
      HandlebarsApplicationMixin: (base) => base,
      DialogV2: class {},
    },
    ux: { FormDataExtended: class {} },
    handlebars: { renderTemplate: async () => "" },
  },
};
global.game = {
  system: { id: "cyberpunk-red-core" },
  settings: { get: () => false },
};

const { default: CPRCombat } = await import(
  "../../../src/modules/combat/cpr-combat.js"
);
const { default: CombatUtils } = await import(
  "../../../src/modules/utils/cpr-combatUtils.js"
);
const { default: DiceHandler } = await import(
  "../../../src/modules/extern/cpr-dice-handler.js"
);
const { default: CPRChat } = await import(
  "../../../src/modules/chat/cpr-chat.js"
);

// These render/roll side effects aren't under test here.
DiceHandler.handle3dDice = async () => {};
CPRChat.RenderRollCard = () => {};

// --- falsy-zero bug (#12) ---
CombatUtils.GetBestInit = () => 0;
assert.equal(
  CPRCombat._getInitiativeFormula({
    actor: { type: "blackIce" },
    initiative: 5,
  }),
  "1",
  "a best initiative of exactly 0 must produce '1', not be treated as 'nobody rolled'"
);

CombatUtils.GetBestInit = () => null;
assert.equal(
  CPRCombat._getInitiativeFormula({
    actor: { type: "blackIce" },
    initiative: null,
  }),
  "30",
  "with nobody having rolled yet, a new Black ICE/Demon should get initiative 30"
);

CombatUtils.GetBestInit = () => 7;
assert.equal(
  CPRCombat._getInitiativeFormula({ actor: { type: "demon" }, initiative: 7 }),
  "7"
);

assert.equal(
  CPRCombat._getInitiativeFormula({
    actor: { type: "character" },
    initiative: null,
  }),
  "1d10"
);

// --- batch rolls must skip an unowned combatant, not abort the batch (#11) ---
function makeCombatant(id, { isOwner = true } = {}) {
  const actor = { type: "character" };
  return {
    id,
    isOwner,
    initiative: null,
    actor,
    token: { actor, id: `${id}-token` },
    async getInitiativeRoll() {
      return {
        resultTotal: 5,
        _roll: {},
        _critRoll: null,
        wasCritical: () => false,
      };
    },
  };
}

const combatantA = makeCombatant("a");
const combatantB = makeCombatant("b", { isOwner: false });
const combatantC = makeCombatant("c");

const combat = Object.create(CPRCombat.prototype);
combat.combatants = {
  get: (id) => ({ a: combatantA, b: combatantB, c: combatantC }[id]),
};
combat.combatant = null;
combat.turns = [];
const updatedIds = [];
combat.updateEmbeddedDocuments = async (docName, updates) => {
  updates.forEach((u) => updatedIds.push(u._id));
};
combat.update = async () => {};

await combat.rollInitiative(["a", "b", "c"]);

assert.deepEqual(
  updatedIds,
  ["a", "c"],
  "an unowned combatant in a batch roll must be skipped, not abort the rest of the batch"
);

console.log("✅ combat initiative regression tests passed");
