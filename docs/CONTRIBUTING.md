# Contributing guide

Everything a new contributor needs to set up a development environment, make a change, and get it merged. For architecture and module layout, see [ARCHITECTURE.md](./ARCHITECTURE.md). For cloud/Docker Foundry setup, see [AGENTS.md](../AGENTS.md). The repo root [CONTRIBUTING.md](../CONTRIBUTING.md) is a short index of these docs.

## Table of contents

- [Prerequisites](#prerequisites)
- [Development environment](#development-environment)
- [Build and watch](#build-and-watch)
- [Running Foundry](#running-foundry)
- [Code style](#code-style)
- [Testing your changes](#testing-your-changes)
- [Document registration (`system.json` and `template.json`)](#document-registration-systemjson-and-templatejson)
- [Performance and update patterns](#performance-and-update-patterns)
- [Common tasks](#common-tasks)
  - [Adding a new actor type](#adding-a-new-actor-type)
  - [Adding a new item type](#adding-a-new-item-type)
  - [Adding a Foundry hook](#adding-a-foundry-hook)
  - [Adding a migration script](#adding-a-migration-script)
  - [Adding a public API function](#adding-a-public-api-function)
  - [Updating the compendium packs](#updating-the-compendium-packs)
- [Pull request checklist](#pull-request-checklist)

## Prerequisites

| Tool                    | Required version  | Notes                                      |
| ----------------------- | ----------------- | ------------------------------------------ |
| Node.js                 | ≥ 15 (CI uses 20) | `node --version`                           |
| npm                     | bundled with Node | Use `npm ci`, not `npm install`            |
| Foundry VTT             | v13 or v14        | Requires valid license for runtime testing |
| `lib-wrapper` module    | any               | Mandatory Foundry module for CPR           |
| Docker + Docker Compose | any recent        | Only needed for the cloud/Docker dev stack |

## Development environment

```bash
# Install dependencies (respects package-lock.json)
npm ci
```

### `foundryconfig.json`

By default, the build outputs to `dist/`. To point the build directly at a local Foundry user-data directory:

```bash
cp foundryconfig.json.example foundryconfig.json
# Edit dataPath to your Foundry user-data root, e.g.:
# { "dataPath": "/home/user/.local/share/FoundryVTT" }
```

The build script validates that `dataPath` does not contain `.git` and rejects it if so. Never point `dataPath` at this repository.

### Docker dev stack (cloud / CI)

For contributors using the Cursor Cloud agent or a Docker-based setup:

```bash
# Start Foundry in Docker (idempotent – safe to run again)
./scripts/foundry-docker.sh up

# Build and push system files into the running container
npm run build && ./scripts/foundry-docker.sh sync-system

# Check container status + HTTP probe
./scripts/foundry-docker.sh status
```

Foundry becomes available at `http://127.0.0.1:30000`.

Credentials (`FOUNDRY_USERNAME` / `FOUNDRY_PASSWORD`) come from Cursor Cloud secrets or `~/foundry-docker.env`. See [AGENTS.md](../AGENTS.md) for full setup details.

## Build and watch

```bash
# One-shot build (clean → assets + packs + CSS)
npm run build

# Watch mode (no clean; live rebuild to dist/)
npm run watch
```

`npm run watch` deliberately skips the `clean` step. Wiping `dist/` while Foundry has open LevelDB file descriptors on compendium packs crashes the client. Use `npm run build` only when Foundry is not running or after stopping it.

After a `watch` build, push changes into the Docker container:

```bash
./scripts/foundry-docker.sh sync-system
```

## Running Foundry

1. Open `http://127.0.0.1:30000` in a browser.
2. Create (or open) a world using the **Cyberpunk RED - CORE** system.
3. Ensure the **`lib-wrapper`** module is installed and active.
4. Reload the world after each `sync-system` (`F5` or Foundry's built-in reload).

Optional modules that improve specific features but are not required for basic testing:

- **Babele** — translation support
- **Quick Insert** — needed for cyberpunkred.com v2 import (full item lookup)
- **Dice So Nice / DDDice** — 3D dice animations

## Code style

Run all checks before pushing:

```bash
npm run lint        # ESLint (modules + gulp scripts)
npm run stylelint   # CSS lint
npm run prettier    # Prettier formatting check
```

All three must pass with zero errors. Fix issues with:

```bash
npx eslint --fix src/modules/ gulp/ gulpfile.mjs
npx prettier --write src/modules/ gulp/ gulpfile.mjs
```

**Key rules:**

- Use `LOGGER` from `utils/cpr-logger.js` instead of `console.log` (except where noted — `LOGGER` does not work inside ActiveEffect getters).
- Never reference `CONST.ACTIVE_EFFECT_MODES` — it was removed in Foundry V14. Use string change types (`"add"`, `"multiply"`, etc.) and `CPRMod.normalizeChangeType()` for legacy compatibility.
- Do not add jQuery calls in new code. V2 sheets pass native `HTMLElement`, not a jQuery wrapper.

## Testing your changes

There is no automated unit test suite. Run `npm run test:regression` for template syntax checks, then smoke-test in Foundry — see [REGRESSION-TESTING.md](./REGRESSION-TESTING.md) for the full E2E checklist (required for sheet, template, and dialog changes).

### Smoke test checklist

After building and syncing your changes:

- [ ] No console errors on world load.
- [ ] Character sheet opens and displays stats, skills, gear.
- [ ] Rolling a skill check produces a chat card.
- [ ] Active effects on equipped / unequipped items suppress / activate correctly.
- [ ] Any sheets or dialogs affected by your change render without errors.

For migration changes, test with a world at `version - 1`:

1. Open browser console.
2. Run `game.settings.set("cyberpunk-red-core", "dataModelVersion", <N-1>)`.
3. Reload the world. Migration should run automatically for GMs.

## Document registration (`system.json` and `template.json`)

When adding a new actor or item type, both files need a **type registration**, but only the DataModel defines fields.

| File                | What to add                                                                                         | What not to add                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **`system.json`**   | The new type under `documentTypes` for `Actor` or `Item`                                            | Field schema (use DataModel)                                      |
| **`template.json`** | A **stub entry** under `Actor.types` or `Item.types` so Foundry does not warn about an unknown type | New field definitions — the DataModel is authoritative at runtime |

**Rule of thumb:** `system.json` tells Foundry the type exists; `template.json` holds a minimal placeholder for legacy compatibility; all field schema, defaults, and validation live in the `DataModel` class under `src/modules/datamodels/`.

See also [ARCHITECTURE.md — Legacy `template.json`](./ARCHITECTURE.md#legacy-templatejson).

## Performance and update patterns

### Hook update batching

Hook handlers run on hot document lifecycle events (`createItem`, `updateItem`, `preUpdateActor`, etc.). Poor patterns here cause update→hook→update cascades and unnecessary database round-trips.

**Do:**

- Merge multiple field changes into a **single** `actor.update()` or `item.update()` call when they belong to the same event.
- Check the `diff` / changed fields before writing — skip work when your hook's fields are unaffected.
- Prefer returning early when preconditions are not met.

**Avoid:**

- Multiple sequential `update()` calls in one handler when one merged diff suffices (see `update-role-from-item.js`, which can issue two `actor.update()` calls on `createItem`).
- Calling `update()` from a hook without guarding against your own writes re-entering the same hook.
- Per-item loops that each call `updateEmbeddedDocuments` when a single batch update would work.

Migrations follow the same batching principle: mutate `itemData` / `actorData` in place and let the migration runner persist changes — never call `item.update()` inside a migration script.

### Chat listener lifecycle

Chat card click handlers are wired in `hooks/chat/add-glyphs.js` on `renderChatMessageHTML`. Foundry can re-render message HTML, and `CPRChat.chatListeners()` currently uses jQuery `.on("click", …)` without a matching `.off()` — handlers can stack on re-render.

When adding or changing chat interactions:

- Treat `chatListeners` as **idempotent** — guard with a data attribute or namespace if you add new bindings.
- Prefer delegated listeners on a stable parent over per-element bindings inside re-rendered fragments.
- Do not assume one `renderChatMessageHTML` call per message lifetime.

Sheet listeners use the `AbortController` pattern instead; see [ARCHITECTURE.md — Listener lifecycle](./ARCHITECTURE.md#listener-lifecycle-and-abortcontroller).

### Sheet and data-prep hot paths

- **`CPRItem.prepareDerivedData()`** calls `loadMixins()` on every data-prep cycle. Keep runtime mixin bodies lightweight.
- **`_prepareContext`** runs on every sheet render. Avoid expensive computation there; the base actor sheet already enriches HTML and prepares effect categories.
- **`submitOnChange: true`** (default on `CPRActorSheet`) triggers a document update and full data-prep cascade on every input change.
- When gathering roll modifiers, call `CPRMod.getAllModifiers(effects)` **once** on the full effect set, then filter with `getRelevantMods` — do not call `getAllModifiers` per effect.

## Common tasks

### Adding a new actor type

1. **DataModel** — create `src/modules/datamodels/actor/<type>-datamodel.js` extending `CPRSystemDataModel.mixin(...)`.
2. **Document class** — create `src/modules/actor/cpr-<type>.js` extending `CPRActor` (or `Actor` for non-humanoid actors like `CPRContainerActor`).
3. **Sheet** — create `src/modules/actor/sheet/cpr-<type>-sheet.js` extending `CPRActorSheet` (Application V2).
4. **Templates** — add Handlebars templates under `src/templates/actor/`.
5. **Registration in `cpr.js`**:
   - Import the sheet and register it with `Actors.registerSheet`.
   - Import the DataModel and add it to `CONFIG.Actor.dataModels.<type>`.
6. **Entity factory** — add `actorTypes.<type> = CPR<Type>Actor` in `entity-factory.js`.
7. **`system.json`** — add the type to `"Actor"` in the `documentTypes` section.
8. **`template.json`** — add a type stub under `Actor.types` (no new field definitions).
9. **Default icon** — add a case in `src/modules/hooks/actor/set-default-image.js` if needed.
10. **Localization** — add the type name to `src/lang/en.json`.

### Adding a new item type

1. **DataModel** — `src/modules/datamodels/item/<type>-datamodel.js` using `CPRSystemDataModel.mixin(...)` with schema fragments from `datamodels/item/mixins/`.
2. **Document class** — `src/modules/item/types/cpr-<type>.js` extending `CPRItem` (can be nearly empty if behaviour comes from runtime mixins).
3. **Entity factory** — `itemTypes.<type> = CPR<Type>Item` in `entity-factory.js`.
4. **Registration** — `CONFIG.Item.dataModels.<type> = <Type>DataModel` in `cpr.js`.
5. **Templates** — sheet template in `src/templates/item/` if needed (`CPRItemSheet` handles most types).
6. **`system.json`** — add the type to `documentTypes` for `Item`.
7. **`template.json`** — add a type stub under `Item.types` (no new field definitions).
8. **Default icon** — add a case in `src/modules/hooks/item/set-default-image.js`.
9. **Localization** — add the type name to `src/lang/en.json`.
10. **Migration** — only if replacing existing data or backfilling worlds.

Runtime mixins are picked up automatically when schema `mixinName` values match. See [ARCHITECTURE.md — Item system: dual mixins](./ARCHITECTURE.md#item-system-dual-mixins).

### Adding a Foundry hook

1. Create `src/modules/hooks/<category>/<name>.js`.
2. Export a single **default function** that registers hook listeners:

   ```js
   // hooks/actor/my-new-hook.js
   const MyNewHook = () => {
     Hooks.on("updateActor", (actor, diff, options, userId) => {
       // ...
     });
   };
   export default MyNewHook;
   ```

3. Add the relative path to the `hooksImports` array in `src/modules/system/hooks.js`.

`registerHooks()` is called at the bottom of `cpr.js` when the module loads, **before** `Hooks.once("init")` fires. See [Performance and update patterns](#performance-and-update-patterns) for batching guidance.

### Adding a migration script

1. Create `src/modules/system/migrate/scripts/NNN-description.js` where `NNN` is the next integer after `#LATEST_VERSION` in `migration.js` (zero-padded, e.g. `045-my-change.js`).
2. Extend `BaseMigrationScript`:

   ```js
   import BaseMigrationScript from "../base-migration-script.js";

   export default class Migration045 extends BaseMigrationScript {
     static version = 45;
     static name = "Short description of the change";
     static documentFilters = {
       Item: { types: ["weapon"], mixins: [] },
       Actor: { types: [], mixins: [] },
     };

     async updateItem(itemData) {
       // Mutate itemData in place — do NOT call item.update() here.
       itemData.system.myNewField = itemData.system.oldField ?? "default";
     }
   }
   ```

3. Add an export to `src/modules/system/migrate/scripts/index.js`.
4. Increment `static #LATEST_VERSION` in `migration.js`.
5. Test: set `dataModelVersion` to `NN - 1` in a test world and reload.

### Adding a public API function

For **actor utilities** accessible at `game.cpr.api.actor.<name>`:

1. Create `src/modules/api/actor/<name>.js` exporting a named function.
2. Add it to the `modules` array in `api/initialize.js`:

   ```js
   import myNewFunction from "./actor/my-new-function.js";
   // ...
   const modules = [empableItems, myNewFunction];
   ```

The function's `name` property becomes its key under `game.cpr.api.actor`.

For other namespaces (`additions`, `import`), import the function in `api/initialize.js` and add it to the returned object manually.

### Updating the compendium packs

Compendium data lives as YAML in `src/packs/`. To edit an entry:

1. Edit the YAML file directly, or modify the data in-world and then extract:

   ```bash
   npm run extractPacks
   ```

2. Rebuild packs:

   ```bash
   npx gulp generatePacks
   npm run build
   ```

3. Sync into Foundry:

   ```bash
   ./scripts/foundry-docker.sh sync-system
   ```

## Pull request checklist

Before opening a PR:

- [ ] `npm run lint` passes with no errors.
- [ ] `npm run stylelint` passes.
- [ ] `npm run prettier` passes.
- [ ] `npm run build` succeeds.
- [ ] Smoke tested in a live Foundry world (see [Testing your changes](#testing-your-changes)).
- [ ] If a data model changed, a migration script exists and `#LATEST_VERSION` is incremented.
- [ ] `CHANGELOG.md` updated under the unreleased section (follow [Keep a Changelog](https://keepachangelog.com) format).
