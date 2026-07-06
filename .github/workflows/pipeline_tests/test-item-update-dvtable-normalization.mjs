/**
 * Regression test for #95/#97: clearing the "Measure DV" dropdown (which
 * writes `system.dvTable: null`) must be remapped to an empty string for
 * every item type that shares that non-nullable field/control: weapons,
 * weapon-type cyberware, and weapon-type itemUpgrades. The fix originally
 * only covered `type === "weapon"`, so clearing the dropdown on cyberware or
 * an itemUpgrade failed schema validation on save.
 *
 * Run: node .github/workflows/pipeline_tests/test-item-update-dvtable-normalization.mjs
 */
import assert from "node:assert/strict";

global.Item = class {
  // eslint-disable-next-line class-methods-use-this
  async update(data) {
    return data;
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

const { default: CPRItem } = await import(
  "../../../src/modules/item/cpr-item.js"
);

async function updateAs(type, data) {
  const item = Object.create(CPRItem.prototype);
  item.type = type;
  item.system = { usage: "toggled" };
  return item.update(data);
}

for (const type of ["weapon", "cyberware", "itemUpgrade"]) {
  // eslint-disable-next-line no-await-in-loop
  const result = await updateAs(type, { "system.dvTable": null });
  assert.equal(
    result["system.dvTable"],
    "",
    `clearing the DV table dropdown on a ${type} must normalize null to ""`
  );
}

// Item types that don't share the control are untouched by this remap.
const gearResult = await updateAs("gear", { "system.dvTable": null });
assert.equal(gearResult["system.dvTable"], null);

console.log("✅ item update dvTable-normalization regression tests passed");
