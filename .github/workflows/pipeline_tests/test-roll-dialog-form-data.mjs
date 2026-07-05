/**
 * Regression tests for roll dialog luck and additional modifier form handling.
 * Run: node .github/workflows/pipeline_tests/test-roll-dialog-form-data.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

global.foundry = {
  utils: {
    duplicate(obj) {
      return structuredClone(obj);
    },
  },
};

const { default: normalizeRollDialogFormData } = await import(
  "../../../src/modules/dialog/cpr-roll-dialog-form-data.js"
);

const luckOnly = normalizeRollDialogFormData({ luck: "2", statValue: 5 });
assert.equal(luckOnly.data.luck, 2);
assert.equal(luckOnly.data.statValue, 5);
assert.equal(luckOnly.invalidAdditionalMods, false);

const additionalMods = normalizeRollDialogFormData({
  additionalMods: "1 -2, 3",
  luck: 0,
});
assert.deepEqual(additionalMods.data.additionalMods, [1, -2, 3]);
assert.equal(additionalMods.invalidAdditionalMods, false);

const invalidMods = normalizeRollDialogFormData({
  additionalMods: "1, foo, 2",
});
assert.deepEqual(invalidMods.data.additionalMods, [1, 2]);
assert.equal(invalidMods.invalidAdditionalMods, true);

const emptyMods = normalizeRollDialogFormData({});
assert.deepEqual(emptyMods.data.additionalMods, []);
assert.equal(emptyMods.data.luck, undefined);

const damageForm = normalizeRollDialogFormData({
  additionalMods: "2",
  isAutofire: true,
  autofireMultiplier: "3",
  isAimed: false,
  location: "head",
});
assert.deepEqual(damageForm.data.additionalMods, [2]);
assert.equal(damageForm.data.isAutofire, true);
assert.equal(damageForm.data.autofireMultiplier, 3);
assert.equal(damageForm.data.isAimed, false);
assert.equal(damageForm.data.location, "head");
assert.equal(damageForm.data.luck, undefined);

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rollTemplatesDir = path.resolve(
  testDir,
  "../../../src/templates/dialog/rolls"
);
const rollTemplates = fs
  .readdirSync(rollTemplatesDir)
  .filter((file) => file.endsWith("-prompt.hbs"));

for (const template of rollTemplates) {
  const contents = fs.readFileSync(
    path.join(rollTemplatesDir, template),
    "utf8"
  );
  assert.match(
    contents,
    /<section class="dialog-sheet">/,
    `${template} should use <section> instead of nested <form>`
  );
  assert.doesNotMatch(
    contents,
    /<form class="dialog-sheet">/,
    `${template} must not nest a <form> inside Application V2 dialog form`
  );
}

// Every CPRDialog subclass renders its part template inside an Application V2
// root element that is *already* a <form> (see CPRDialog.DEFAULT_OPTIONS.tag).
// A part template that wraps its own content in another <form> creates a
// nested form; FormDataExtended then never captures fields inside it (this
// is exactly what broke roll dialog luck/additionalMods above, and later
// broke ledger scrolling and install-target radio selection the same way).
// Recursively check every dialog template, not just the rolls ones, so this
// class of bug can't reappear unnoticed in a new or edited prompt.
const dialogTemplatesDir = path.resolve(
  testDir,
  "../../../src/templates/dialog"
);

function collectHbsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectHbsFiles(fullPath);
    return entry.name.endsWith(".hbs") ? [fullPath] : [];
  });
}

for (const templatePath of collectHbsFiles(dialogTemplatesDir)) {
  const contents = fs.readFileSync(templatePath, "utf8");
  assert.doesNotMatch(
    contents,
    /<form class="/,
    `${path.relative(
      dialogTemplatesDir,
      templatePath
    )} must not nest a <form> inside the Application V2 dialog form`
  );
}

const damagePrompt = fs.readFileSync(
  path.join(rollTemplatesDir, "cpr-verify-roll-damage-prompt.hbs"),
  "utf8"
);
assert.match(
  damagePrompt,
  /name="isAutofire"[\s\S]*data-dtype="Checkbox"/,
  "damage roll isAutofire checkbox must declare data-dtype Checkbox"
);
assert.match(
  damagePrompt,
  /cpr-additional-modifiers\.hbs/,
  "damage roll prompt must include additional modifiers partial"
);

console.log("✅ roll dialog form data regression tests passed");
