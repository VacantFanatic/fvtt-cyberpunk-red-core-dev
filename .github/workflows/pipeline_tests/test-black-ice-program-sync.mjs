/**
 * Regression tests for #95/#98: the Black ICE <-> Program sync hook must only
 * touch the linked program when the update actually changed `rez`, and must
 * not crash when the linked program can no longer be found. Previously it ran
 * unconditionally on any stats change and didn't null-check the lookup, which
 * could silently wipe a program's REZ or throw and break the preUpdateActor
 * hook chain.
 *
 * Run: node .github/workflows/pipeline_tests/test-black-ice-program-sync.mjs
 */
import assert from "node:assert/strict";

let registeredHandler;
global.Hooks = {
  on(name, fn) {
    if (name === "preUpdateActor") registeredHandler = fn;
  },
};

function makeBlackIceDoc({ getOwnedItemResult }) {
  const scene = {
    tokens: {
      filter: (fn) => [{ id: "netrunner-token" }].filter(fn),
    },
  };
  global.game = {
    system: { id: "cyberpunk-red-core" },
    scenes: {
      filter: (fn) => [scene].filter(fn),
    },
  };
  scene.id = "scene1";
  const netrunnerToken = { id: "netrunner-token" };
  scene.tokens = { filter: (fn) => [netrunnerToken].filter(fn) };
  netrunnerToken.actor = {
    getOwnedItem: () => getOwnedItemResult,
  };

  return {
    type: "blackIce",
    isToken: true,
    token: {
      getFlag: (systemId, key) => {
        if (key === "netrunnerTokenId") return "netrunner-token";
        if (key === "programUUID") return "program-uuid";
        if (key === "sceneId") return "scene1";
        return undefined;
      },
    },
  };
}

const { default: SyncBlackIceWithProgram } = await import(
  "../../../src/modules/hooks/actor/sync-black-ice-with-program.js"
);
SyncBlackIceWithProgram();

// A per/spd/atk/def stat change (no "rez" key) must not touch the linked program at all.
let updateCalled = false;
const program = {
  update: async () => {
    updateCalled = true;
  },
};
const docA = makeBlackIceDoc({ getOwnedItemResult: program });
await registeredHandler(docA, { system: { stats: { per: { value: 5 } } } });
assert.equal(
  updateCalled,
  false,
  "A non-rez stat change must not write to the linked program's rez"
);

// A rez change with a still-linked program should sync rez onto it.
let syncedRez;
const program2 = {
  update: async (data) => {
    syncedRez = data["system.rez"];
  },
};
const docB = makeBlackIceDoc({ getOwnedItemResult: program2 });
await registeredHandler(docB, {
  system: { stats: { rez: { value: 3, max: 10 } } },
});
assert.deepEqual(syncedRez, { value: 3, max: 10 });

// A rez change where the linked program was deleted/unequipped must not throw.
const docC = makeBlackIceDoc({ getOwnedItemResult: undefined });
await assert.doesNotReject(
  () => registeredHandler(docC, { system: { stats: { rez: { value: 1 } } } }),
  "a rez update must not throw when the linked program can no longer be found"
);

console.log("✅ black ice / program sync regression tests passed");
