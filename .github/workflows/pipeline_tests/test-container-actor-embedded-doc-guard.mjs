/**
 * Regression test for #95/#96: CPRContainerActor#createEmbeddedDocuments must
 * take the fast (super) path for any embedded document type other than
 * "Item". An operator-precedence bug (`!embeddedName === "Item"`, which
 * always evaluates to false) previously defeated this guard, so creating
 * non-Item embedded documents (e.g. ActiveEffect, used by
 * createEffect()/copyEffect()) never took the intended fast path.
 *
 * Run: node .github/workflows/pipeline_tests/test-container-actor-embedded-doc-guard.mjs
 */
import assert from "node:assert/strict";

global.Actor = class {
  async createEmbeddedDocuments(embeddedName, items, context) {
    if (embeddedName !== "Item")
      return { viaSuper: true, embeddedName, items, context };
    // Simulate Foundry returning the created documents array for the Item path.
    return items;
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
global.game = {
  system: { id: "cyberpunk-red-core" },
  settings: { get: () => false },
};

const { default: CPRContainerActor } = await import(
  "../../../src/modules/actor/cpr-container.js"
);

const instance = Object.create(CPRContainerActor.prototype);

const activeEffectResult = await instance.createEmbeddedDocuments(
  "ActiveEffect",
  [{ id: "eff1" }]
);
assert.equal(
  activeEffectResult.viaSuper,
  true,
  "non-Item embedded documents (e.g. ActiveEffect) must take the super fast path"
);

const itemResult = await instance.createEmbeddedDocuments("Item", []);
assert.notEqual(
  itemResult?.viaSuper,
  true,
  "Item embedded documents must NOT take the super fast path (they need the container-specific logic)"
);

console.log(
  "✅ container actor embedded-document guard regression tests passed"
);
