/**
 * Regression: character PC sheet must open at 1050px under Application V2.
 * Run: node .github/workflows/pipeline_tests/test-character-sheet-default-width.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const characterSheetSource = fs.readFileSync(
  path.resolve(
    testDir,
    "../../../src/modules/actor/sheet/cpr-character-sheet.js",
  ),
  "utf8",
);

assert.match(
  characterSheetSource,
  /static DEFAULT_OPTIONS[\s\S]*position:\s*\{[\s\S]*width:\s*1050/,
  "CPRCharacterActorSheet must declare DEFAULT_OPTIONS.position.width 1050 for Application V2",
);

assert.match(
  characterSheetSource,
  /constructor\(options = \{\}\)[\s\S]*resizeCPRSheets[\s\S]*height:\s*850/,
  "CPRCharacterActorSheet must apply resizeCPRSheets height in constructor before super()",
);

console.log("✅ character sheet default width regression tests passed");
