/**
 * Regression tests for SystemUtils.GetEventDatum ancestor lookup.
 * Run: node .github/workflows/pipeline_tests/test-get-event-datum.mjs
 */
import assert from "node:assert/strict";

function createMockElement(attrs = {}, parent = null) {
  const el = {
    attrs,
    parent,
    dataset: {},
    getAttribute(key) {
      const value = this.attrs[key];
      return value === undefined ? null : value;
    },
    closest(selector) {
      if (selector.startsWith("[") && selector.endsWith("]")) {
        const attr = selector.slice(1, -1);
        let node = this;
        while (node) {
          if (node.attrs[attr] != null) return node;
          node = node.parent;
        }
      }
      return null;
    },
  };
  return el;
}

global.LOGGER = { debug() {} };

const { default: SystemUtils } = await import(
  "../../../src/modules/utils/cpr-systemUtils.js"
);

const parent = createMockElement({
  "data-roll-type": "cyberdeckProgram",
  "data-execution-type": "atk",
});
const icon = createMockElement({}, parent);
const event = { currentTarget: icon };

assert.equal(
  SystemUtils.GetEventDatum(event, "data-roll-type"),
  "cyberdeckProgram"
);
assert.equal(SystemUtils.GetEventDatum(event, "data-execution-type"), "atk");

console.log("✅ get event datum regression tests passed");
