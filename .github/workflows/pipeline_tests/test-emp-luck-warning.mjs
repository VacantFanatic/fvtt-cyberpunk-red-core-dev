/**
 * Regression test for #95/#98: the EMP/Luck triple-digit warning must check
 * both stats independently. A ternary that only ever checked one of the two
 * (whichever was present, preferring emp) meant a bulk update that changed
 * both stats in a single call never warned about an out-of-range luck value.
 *
 * Run: node .github/workflows/pipeline_tests/test-emp-luck-warning.mjs
 */
import assert from "node:assert/strict";

global.Hooks = {
  on(name, fn) {
    if (name === "preUpdateActor") this._handler = fn;
  },
};

const { default: SystemUtils } = await import(
  "../../../src/modules/utils/cpr-systemUtils.js"
);

const warnings = [];
SystemUtils.DisplayMessage = async (msgType, msg) => {
  warnings.push(msg);
};
SystemUtils.Localize = (key) => key;

const { default: CheckEmpAndLuck } = await import(
  "../../../src/modules/hooks/actor/check-emp-and-luck.js"
);
CheckEmpAndLuck();

// A bulk update setting both emp and luck out of range in the same call
// must warn about both, not just emp.
warnings.length = 0;
await global.Hooks._handler(null, {
  system: { stats: { emp: { value: 100 }, luck: { value: 150 } } },
});
assert.ok(
  warnings.includes("CPR.messages.tripleDigitStatValueWarn"),
  "expected a warning for the out-of-range value"
);
assert.equal(
  warnings.filter((w) => w === "CPR.messages.tripleDigitStatValueWarn").length,
  2,
  "both emp and luck being out of range in the same update must each warn"
);

// Only luck out of range (no emp in the payload) must still warn.
warnings.length = 0;
await global.Hooks._handler(null, {
  system: { stats: { luck: { value: 120 } } },
});
assert.equal(
  warnings.filter((w) => w === "CPR.messages.tripleDigitStatValueWarn").length,
  1
);

// In-range values must not warn.
warnings.length = 0;
await global.Hooks._handler(null, {
  system: { stats: { emp: { value: 8 }, luck: { value: 9 } } },
});
assert.equal(warnings.length, 0);

console.log("✅ EMP/Luck triple-digit warning regression tests passed");
