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
  /resolveTemplateElevationRange\s*\(/,
  "AdditionsTemplate must constrain v14 region elevation ranges to the active level"
);

assert.match(
  templateSource,
  /buildRegionDocumentData\s*\(/,
  "Foundry v14 must build Region documents directly instead of relying on MeasuredTemplate shim"
);

assert.match(
  templateSource,
  /createEmbeddedDocuments\("Region"/,
  "Foundry v14 must create Region embedded documents"
);

assert.match(
  templateSource,
  /levels\s*\?\s*\{\s*levels\s*\}/,
  "Foundry v14 regions must receive the active scene level id"
);

assert.match(
  templateSource,
  /elevationRange\s*\?\s*\{\s*elevation:\s*elevationRange\s*\}/,
  "Foundry v14 regions must receive the active scene elevation range"
);

assert.match(
  templateSource,
  /buildTemplateMoveUpdate\s*\(/,
  "Bounce updates must move region shapes on v14"
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

assert.deepEqual(
  withCanvas(
    {
      level: null,
      inferLevelFromElevation: () => ({ id: "level-inferred" }),
    },
    () => AdditionsTemplate.resolveTemplateLevels({ elevation: 15 })
  ),
  ["level-inferred"],
  "Levels should fall back to inferLevelFromElevation when canvas.level is unset"
);

assert.equal(
  withCanvas({ level: null }, () => AdditionsTemplate.resolveTemplateLevels()),
  null,
  "Levels should be omitted when no active canvas level exists"
);

assert.deepEqual(
  withCanvas(
    { level: { id: "level-2", elevation: { bottom: 10, top: 20 } } },
    () => AdditionsTemplate.resolveTemplateElevationRange()
  ),
  { bottom: 10, top: 20 },
  "Region elevation range should match the active scene level"
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

global.foundry = {
  utils: {
    deepClone: (value) => structuredClone(value),
  },
};

assert.deepEqual(
  withGame(
    { release: { generation: 14 } },
    () =>
      withCanvas(
        {
          scene: {
            regions: {
              get: () => ({
                shapes: [
                  { type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
                ],
              }),
            },
          },
        },
        () => AdditionsTemplate.buildTemplateMoveUpdate("region-1", 50, 75)
      )
  ),
  {
    _id: "region-1",
    shapes: [{ type: "rectangle", x: 50, y: 75, width: 100, height: 100 }],
  },
  "v14 bounce updates should move the region shape coordinates"
);

console.log("✅ explosive template elevation regression tests passed");
