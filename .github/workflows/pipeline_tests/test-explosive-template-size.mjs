/**
 * Regression tests for explosive blast template dimensions (#68).
 * Run: node .github/workflows/pipeline_tests/test-explosive-template-size.mjs
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
  /computeExplosiveBlastDimensions\s*\(/,
  "AdditionsTemplate must expose computeExplosiveBlastDimensions for 10m blast sizing"
);

assert.match(
  templateSource,
  /pickRectBlastCenter\s*\(/,
  "Explosive placement must preview a rectangular blast area instead of a Portal circle"
);

assert.doesNotMatch(
  templateSource,
  /const hypDist = Math\.sqrt\(sizeMeters \* sizeMeters \* 2\)/,
  "Explosive diagonal must be computed in grid units, not meters"
);

const { default: AdditionsTemplate } = await import(
  "../../../src/modules/additions/template.js"
);

assert.deepEqual(
  AdditionsTemplate.computeExplosiveBlastDimensions(10, 2),
  {
    sizeMeters: 10,
    trueWidth: 5,
    rectDiagonal: Math.sqrt(50),
  },
  "10m blast on a 2m grid should be 5x5 squares with a 5*sqrt(2) diagonal"
);

assert.deepEqual(
  AdditionsTemplate.computeExplosiveBlastDimensions(10, 1),
  {
    sizeMeters: 10,
    trueWidth: 10,
    rectDiagonal: Math.sqrt(200),
  },
  "10m blast on a 1m grid should be 10x10 squares"
);

const placement = AdditionsTemplate.buildExplosiveRectPlacementData({
  sizeMeters: 10,
  canvasDist: 2,
  gridSize: 100,
  centerX: 500,
  centerY: 400,
  fillColor: "#ff0000",
  borderColor: "#ff6600",
});

assert.equal(placement.documentData.t, "rect");
assert.equal(placement.documentData.distance, Math.sqrt(50));
assert.equal(placement.documentData.x, 500 - 2.5 * 100);
assert.equal(placement.documentData.y, 400 - 2.5 * 100);
assert.equal(placement.documentData.fillColor, "#ff0000");
assert.equal(placement.documentData.borderColor, "#ff6600");
assert.equal(placement.trueWidth, 5);

console.log("✅ explosive template size regression tests passed");
