/**
 * Regression tests for explosive measured template elevation (issue #63).
 * Run: node .github/workflows/pipeline_tests/test-explosive-template-elevation.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../..");
const templateSource = fs.readFileSync(
  path.join(repoRoot, "src/modules/additions/template.js"),
  "utf8"
);

assert.match(
  templateSource,
  /resolveTemplateElevation\s*\(/,
  "AdditionsTemplate must expose resolveTemplateElevation for level-aware placement"
);

assert.match(
  templateSource,
  /elevation:\s*AdditionsTemplate\.resolveTemplateElevation|elevation:\s*this\.resolveTemplateElevation/,
  "MeasuredTemplate creation must set elevation from resolveTemplateElevation"
);

const { default: AdditionsTemplate } = await import(
  "../../../src/modules/additions/template.js"
);

function withCanvas(mockCanvas, fn) {
  const previous = global.canvas;
  global.canvas = mockCanvas;
  try {
    return fn();
  } finally {
    global.canvas = previous;
  }
}

assert.equal(
  withCanvas(undefined, () =>
    AdditionsTemplate.resolveTemplateElevation({ elevation: 12 })
  ),
  12,
  "Portal pick elevation should be preferred"
);

assert.equal(
  withCanvas(
    {
      tokens: { controlled: [{ document: { elevation: 7 } }] },
      level: { elevation: { bottom: 0, top: 10 } },
    },
    () => AdditionsTemplate.resolveTemplateElevation({})
  ),
  7,
  "Controlled token elevation should be used when pick has no elevation"
);

assert.equal(
  withCanvas(
    {
      tokens: { controlled: [] },
      level: { elevation: { bottom: 10, top: 20 } },
    },
    () => AdditionsTemplate.resolveTemplateElevation(null)
  ),
  10,
  "Current canvas level bottom elevation should be used as fallback"
);

assert.equal(
  withCanvas({ tokens: { controlled: [] }, level: null }, () =>
    AdditionsTemplate.resolveTemplateElevation(undefined)
  ),
  0,
  "Elevation should default to 0 when no level context exists"
);

console.log("✅ explosive template elevation regression tests passed");
