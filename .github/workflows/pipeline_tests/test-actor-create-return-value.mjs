/**
 * Regression tests for #95/#96: CPRBlackIceActor/CPRDemonActor/CPRContainerActor's
 * static create() must return the created actor. A bare `super.create(...)` call
 * (no `return`) previously made create() resolve to `undefined`, crashing the
 * first rez of a Black ICE program (cpr-cyberdeck.js reads `blackIce.name`
 * immediately after awaiting the create() call).
 *
 * Run: node .github/workflows/pipeline_tests/test-actor-create-return-value.mjs
 */
import assert from "node:assert/strict";

global.Actor = class {
  static async create(data) {
    return { ...data, setContainerType: async () => {} };
  }
};

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

const { default: CPRBlackIceActor } = await import(
  "../../../src/modules/actor/cpr-black-ice.js"
);
const { default: CPRDemonActor } = await import(
  "../../../src/modules/actor/cpr-demon.js"
);
const { default: CPRContainerActor } = await import(
  "../../../src/modules/actor/cpr-container.js"
);

const blackIce = await CPRBlackIceActor.create({
  name: "Ice",
  type: "blackIce",
});
assert.notEqual(
  blackIce,
  undefined,
  "CPRBlackIceActor.create() must return the created actor, not undefined"
);
assert.equal(blackIce.name, "Ice");

const demon = await CPRDemonActor.create({ name: "Demon", type: "demon" });
assert.notEqual(
  demon,
  undefined,
  "CPRDemonActor.create() must return the created actor, not undefined"
);
assert.equal(demon.name, "Demon");

const container = await CPRContainerActor.create({
  name: "Box",
  type: "container",
});
assert.notEqual(
  container,
  undefined,
  "CPRContainerActor.create() must return the created actor, not undefined"
);
assert.equal(container.name, "Box");

console.log("✅ actor create() return-value regression tests passed");
