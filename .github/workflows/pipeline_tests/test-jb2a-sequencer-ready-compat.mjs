/**
 * Regression tests for JB2A Sequencer ready compatibility helpers.
 * Run: node .github/workflows/pipeline_tests/test-jb2a-sequencer-ready-compat.mjs
 */
import assert from "node:assert/strict";
import {
  ensureJb2aModuleDatabase,
  getJb2aModuleDatabase,
  prepareJb2aSequencerDatabases,
  waitForJb2aModuleDatabase,
} from "../../../src/modules/hooks/foundry/jb2a-sequencer-ready-compat.js";

assert.deepEqual(getJb2aModuleDatabase(undefined, "freeDatabase"), undefined);
assert.deepEqual(
  getJb2aModuleDatabase({ api: { freeDatabase: { fireball: {} } } }, "freeDatabase"),
  { fireball: {} }
);
assert.equal(
  getJb2aModuleDatabase({ api: { freeDatabase: "bad" } }, "freeDatabase"),
  undefined
);

const ensured = ensureJb2aModuleDatabase({ active: true }, "freeDatabase");
assert.deepEqual(ensured, {});
assert.deepEqual(
  ensureJb2aModuleDatabase(
    { active: true, api: { freeDatabase: { bolt: {} } } },
    "freeDatabase"
  ),
  { bolt: {} }
);

const freeModule = {
  active: true,
  api: {
    get freeDatabase() {
      return { free: true };
    },
  },
};
const patreonModule = { active: true, api: {} };
const modules = {
  get(id) {
    if (id === "JB2A_DnD5e") return freeModule;
    if (id === "jb2a_patreon") return patreonModule;
    return undefined;
  },
};

await prepareJb2aSequencerDatabases(modules, {
  timeoutMs: 100,
  pollMs: 10,
});

assert.deepEqual(patreonModule.api.patreonDatabase, {});

const lateModule = {
  active: true,
  api: {},
};
setTimeout(() => {
  lateModule.api.freeDatabase = { ready: true };
}, 20);

const waited = await waitForJb2aModuleDatabase(lateModule, {
  timeoutMs: 200,
  pollMs: 10,
  getDatabase: (module) => module.api.freeDatabase,
});
assert.deepEqual(waited, { ready: true });

console.log("✅ jb2a sequencer ready regression tests passed");
