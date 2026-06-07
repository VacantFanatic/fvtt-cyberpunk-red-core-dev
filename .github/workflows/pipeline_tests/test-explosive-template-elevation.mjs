/**
 * Regression tests for explosive measured template / region level placement.
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
  /resolveTemplateLevels\s*\(/,
  "AdditionsTemplate must expose resolveTemplateLevels for Foundry v14 scene levels"
);

assert.match(
  templateSource,
  /createPlacedTemplate\s*\(/,
  "AdditionsTemplate must centralize template/region creation"
);

assert.match(
  templateSource,
  /data\.levels\s*=\s*levels/,
  "Foundry v14 regions must receive the active scene level id"
);

assert.match(
  templateSource,
  /getTemplateEmbeddedName\s*\(/,
  "Bounce updates must target Region on v14 and MeasuredTemplate on v13"
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

function withGame(mockGame, fn) {
  const previous = global.game;
  global.game = mockGame;
  try {
    return fn();
  } finally {
    global.game = previous;
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
      level: { id: "level-1", elevation: { bottom: 0, top: 10 } },
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
      level: { id: "level-2", elevation: { bottom: 10, top: 20 } },
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

assert.deepEqual(
  withCanvas({ level: { id: "level-ground" } }, () =>
    AdditionsTemplate.resolveTemplateLevels()
  ),
  ["level-ground"],
  "Active canvas level id should be returned for region confinement"
);

assert.equal(
  withCanvas({ level: null }, () => AdditionsTemplate.resolveTemplateLevels()),
  null,
  "Levels should be omitted when no active canvas level exists"
);

assert.equal(
  withGame({ release: { generation: 13 } }, () =>
    AdditionsTemplate.getTemplateEmbeddedName()
  ),
  "MeasuredTemplate",
  "v13 should continue using MeasuredTemplate documents"
);

assert.equal(
  withGame({ release: { generation: 14 } }, () =>
    AdditionsTemplate.getTemplateEmbeddedName()
  ),
  "Region",
  "v14 should use Region documents for placed templates"
);

console.log("✅ explosive template elevation regression tests passed");
