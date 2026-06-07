/**
 * Regression tests for Application V2 roll dialog click listeners.
 * Run: node .github/workflows/pipeline_tests/test-roll-dialog-listeners.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../..");

const dialogAppSource = fs.readFileSync(
  path.join(repoRoot, "src/modules/dialog/cpr-dialog-application.js"),
  "utf8",
);
const rollDialogSource = fs.readFileSync(
  path.join(repoRoot, "src/modules/dialog/cpr-roll-dialog.js"),
  "utf8",
);
const situationalTemplate = fs.readFileSync(
  path.join(
    repoRoot,
    "src/templates/dialog/rolls/cpr-situational-modifiers.hbs",
  ),
  "utf8",
);

assert.match(
  dialogAppSource,
  /_onRender\s*\([^)]*\)\s*\{[\s\S]*this\.activateListeners\(this\.element\)/,
  "CPRDialog must re-bind listeners from _onRender under Application V2",
);

assert.match(
  dialogAppSource,
  /function resolveDialogRoot|resolveDialogRoot\(/,
  "CPRDialog must normalize HTMLElement roots for V2",
);

const activateListenersBlock = rollDialogSource.match(
  /activateListeners\(html\)\s*\{[\s\S]*?\n  \}/,
)?.[0];
assert.ok(
  activateListenersBlock,
  "CPRRollDialog.activateListeners should be present",
);
assert.doesNotMatch(
  activateListenersBlock,
  /html\s*\.find\(/,
  "CPRRollDialog must not use jQuery-style html.find() listeners",
);

assert.match(
  activateListenersBlock,
  /onClick\("\.toggle-show-mods"/,
  "CPRRollDialog must bind native click listeners for core situational toggles",
);

assert.match(
  activateListenersBlock,
  /onClick\("\.toggle-situational-mod"/,
  "CPRRollDialog must bind native click listeners for situational modifiers",
);

assert.match(
  situationalTemplate,
  /class="toggle-show-mods" data-target="default-mods"/,
  "core situational modifiers toggle must expose data-target for click handling",
);

console.log("✅ roll dialog listener regression tests passed");
