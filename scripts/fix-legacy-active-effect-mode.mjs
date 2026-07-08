/**
 * One-shot migration: convert legacy numeric ActiveEffect `mode` fields in
 * shipped compendium pack YAML to the Foundry V14+ string `type` field.
 *
 * The pack YAML under src/packs/** was never migrated when the system
 * switched to string change types (see migration script 044 and
 * docs/ACTIVE-EFFECTS.md). Any change targeting a raw `system.*` key (e.g.
 * `system.stats.int.value`) bypasses CPRMod's legacy-mode fallback and is
 * applied directly by Foundry core, which no longer understands a type-less
 * `mode` -- this is what caused stat increments to behave like string
 * concatenation instead of numeric addition.
 *
 * Run: node scripts/fix-legacy-active-effect-mode.mjs
 */
import fs from "fs";
import path from "path";
import YAML from "js-yaml";

const ROOT = path.resolve(import.meta.dirname, "..", "src", "packs");

// Mirrors LEGACY_MODE_TO_TYPE in src/modules/rolls/cpr-modifiers.js and
// migration script 044.
const LEGACY_MODE_TO_TYPE = {
  0: "custom",
  1: "multiply",
  2: "add",
  3: "downgrade",
  4: "upgrade",
  5: "override",
};

function isEffectChange(node) {
  return (
    node &&
    typeof node === "object" &&
    !Array.isArray(node) &&
    typeof node.key === "string" &&
    typeof node.mode === "number" &&
    "value" in node
  );
}

// Recursively walk the parsed YAML document (standalone effect.*.yaml files
// have `changes` at the top level; item files like drug.sixgun.yaml embed
// effects under items[].effects[].changes[]), converting every effect
// change object found along the way.
function convert(node) {
  let changed = false;
  if (Array.isArray(node)) {
    for (const entry of node) {
      if (convert(entry)) changed = true;
    }
  } else if (node && typeof node === "object") {
    if (isEffectChange(node)) {
      node.type = LEGACY_MODE_TO_TYPE[node.mode] ?? "add";
      delete node.mode;
      changed = true;
    }
    for (const value of Object.values(node)) {
      if (convert(value)) changed = true;
    }
  }
  return changed;
}

function* walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) yield* walk(p);
    else if (ent.name.endsWith(".yaml")) yield p;
  }
}

let changedFiles = 0;
for (const file of walk(ROOT)) {
  const raw = fs.readFileSync(file, "utf8");
  const data = YAML.load(raw);
  if (convert(data)) {
    fs.writeFileSync(
      file,
      YAML.dump(data, { sortKeys: true, quotingType: '"', lineWidth: 80 })
    );
    changedFiles += 1;
    console.log(file.replace(`${ROOT}${path.sep}`, ""));
  }
}
console.log(`Done. Updated ${changedFiles} files.`);
