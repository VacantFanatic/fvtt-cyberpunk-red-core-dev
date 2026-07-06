/**
 * Regression test for #95/#98: deleting a Folder of Items must combine every
 * item's `preDeleteItem` veto, not just the last one in the folder. The
 * previous implementation overwrote `deleteFolder` on each loop iteration, so
 * a protected/installed item that wasn't last in the folder had its veto
 * silently discarded.
 *
 * Run: node .github/workflows/pipeline_tests/test-delete-folder-veto.mjs
 */
import assert from "node:assert/strict";

let registeredHandler;
global.Hooks = {
  on(name, fn) {
    if (name === "preDeleteFolder") registeredHandler = fn;
  },
  call(name, item) {
    if (name === "preDeleteItem") return !item.protected;
    return true;
  },
};

const { default: PreDeleteFolder } = await import(
  "../../../src/modules/hooks/foundry/delete-folder.js"
);
PreDeleteFolder();

// A protected item that is NOT last in the folder must still block deletion
// of the whole folder.
const folderWithEarlyVeto = {
  type: "Item",
  contents: [{ protected: true }, { protected: false }],
};
assert.equal(
  registeredHandler(folderWithEarlyVeto, { deleteContents: true }),
  false,
  "a veto from an item that isn't last in the folder must still block the delete"
);

// A protected item that IS last should also block (sanity check the other order).
const folderWithLateVeto = {
  type: "Item",
  contents: [{ protected: false }, { protected: true }],
};
assert.equal(
  registeredHandler(folderWithLateVeto, { deleteContents: true }),
  false
);

// No vetoes at all: the folder should be deletable.
const folderNoVeto = {
  type: "Item",
  contents: [{ protected: false }, { protected: false }],
};
assert.equal(registeredHandler(folderNoVeto, { deleteContents: true }), true);

// A folder that isn't deleting its contents is untouched by this logic.
const folderNotDeletingContents = {
  type: "Item",
  contents: [{ protected: true }],
};
assert.equal(
  registeredHandler(folderNotDeletingContents, { deleteContents: false }),
  true
);

console.log("✅ delete-folder veto regression tests passed");
