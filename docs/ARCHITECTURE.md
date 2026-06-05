# System Architecture

This document describes the runtime architecture of **Cyberpunk RED - CORE**, a Foundry VTT game system. It is aimed at contributors who want to understand how the pieces fit together before making changes.

## Table of contents

- [High-level overview](#high-level-overview)
- [Entry point: `cpr.js`](#entry-point-cprjs)
- [Module map](#module-map)
- [Entity factory](#entity-factory)
- [Data models](#data-models)
- [Item system: dual mixins](#item-system-dual-mixins)
- [Actor sheets (Application V2)](#actor-sheets-application-v2)
- [Rolls pipeline](#rolls-pipeline)
- [Active effects](#active-effects)
- [Hooks system](#hooks-system)
- [Migration system](#migration-system)
- [Public API (`game.cpr.api`)](#public-api-gamecprapi)
- [Build system](#build-system)

---

## High-level overview

CPR is a **Foundry VTT game system package**. Foundry loads `src/cpr.js` as an ES module during world initialization. All runtime logic lives under `src/modules/`; CSS/assets are processed by a Gulp pipeline into `dist/`.

```
Foundry VTT
  └─ cpr.js (Hooks.once "init")
       ├─ Registers CONFIG.Actor / Item / ActiveEffect / Combat document classes
       ├─ Registers actor + item sheets
       ├─ Registers data models (CONFIG.*.dataModels)
       ├─ Loads settings, templates, Handlebars helpers
       ├─ Loads hook registrations (system/hooks.js)
       └─ (on "ready", GM only) Runs MigrationRunner
```

There are no server-side components. Every JS file runs in the browser inside the Foundry client.

---

## Entry point: `cpr.js`

`src/cpr.js` is the single bootstrap module. Its `Hooks.once("init")` callback wires the system:

1. **Unregisters** the core Foundry `ActorSheet` and `ItemSheet` to avoid showing default sheets.
2. **Assigns document classes** — `CONFIG.Actor.documentClass`, `CONFIG.Item.documentClass`, `CONFIG.ActiveEffect.documentClass`, `CONFIG.Combat.documentClass`, `CONFIG.Combatant.documentClass` — via the entity-factory proxy (see below).
3. **Registers data models** — `CONFIG.Actor.dataModels.*` and `CONFIG.Item.dataModels.*`.
4. **Exposes `game.cpr`** — the system's global namespace with `apps`, `macro`, and `api`.
5. **Sets `CONFIG.ActiveEffect.legacyTransferral = false`** — required so item-owned effects are not auto-promoted to actor-owned on transfer.
6. **Registers status effects** from `system.json` flags rather than a hardcoded list.
7. **Calls `registerHooks()`** to load all `hooks/` modules.
8. **Instantiates `MigrationRunner`** (stored at `game.cpr.MigrationRunner`).

`Hooks.once("ready")` runs GM-only world migration if the stored `dataModelVersion` is below the current target and shows a changelog popup if migration just completed.

The file has no exports; it is a side-effect module loaded by Foundry.

---

## Module map

```
src/modules/
├── actor/              # Actor document subclasses + Application V2 sheets
├── additions/          # Optional GM tools (DV hover, cover, templates) via lib-wrapper
├── api/                # Public game.cpr.api surface for macros / external modules
├── apps/               # Settings UI apps (compendium source picker)
├── chat/               # Roll card rendering + damage prompts
├── combat/             # CPRCombat + CPRCombatant (initiative rules)
├── cpr-active-effect.js       # CPRActiveEffect document
├── cpr-active-effect-sheet.js # CPRActiveEffectSheet config UI
├── datamodels/         # Foundry DataModel schemas (validation, migration)
│   ├── actor/          # 5 actor-type models
│   ├── item/           # 15 item-type models + mixins/ (schema fragments)
│   └── shared/         # container-schema shared by actors + items
├── dialog/             # Application V2 dialogs (rolls, ledgers, role bonuses)
├── entity-factory.js   # Proxy routing Actor/Item construction by type
├── extern/             # Third-party dice bridges (Dice So Nice, DDDice)
├── hooks/              # Decentralized Foundry hook registrations
├── hud/                # Token HUD helpers (DV table selection)
├── import/             # cyberpunkred.com character importer
├── item/               # Item document subclasses + runtime mixins + sheet
├── rolls/              # CPRRoll hierarchy + CPRMod
├── system/             # Bootstrap helpers: settings, config, migrate, ruler
└── utils/              # Cross-cutting helpers (rules, sheet utils, enrichment)
```

---

## Entity factory

**`src/modules/entity-factory.js`**

Foundry requires a single class assigned to `CONFIG.Actor.documentClass`. CPR needs five distinct actor subclasses. The entity factory solves this with a JavaScript `Proxy`.

```js
// entity-factory.js (simplified)
function factory(entities, baseClass) {
  return new Proxy(baseClass, {
    construct: (target, [data, options]) => {
      const constructor = entities[data.type]; // e.g. "character" → CPRCharacterActor
      return new constructor(data, options);
    },
    get: (target, prop) => {
      if (prop === "create") return (data, opts) => entities[data.type].create(data, opts);
      return baseClass[prop];
    },
  });
}
```

The proxy intercepts `new Actor(data)` and `Actor.create(data)` and routes to the correct subclass. The `instanceof` trap is also overridden so `actor instanceof CPRCharacterActor` works correctly after the proxy.

**Important:** Code that runs during `Hooks.once("init")` cannot rely on game settings because they are not loaded yet. The factory itself is instantiated at module-evaluation time, so keep it free of settings access.

### Actor type map

| `data.type` | Class |
|---|---|
| `character` | `CPRCharacterActor` |
| `mook` | `CPRMookActor` |
| `blackIce` | `CPRBlackIceActor` |
| `demon` | `CPRDemonActor` |
| `container` | `CPRContainerActor` |

### Item type map

| `data.type` | Class |
|---|---|
| `ammo` | `CPRAmmoItem` |
| `armor` | `CPRArmorItem` |
| `clothing` | `CPRClothingItem` |
| `criticalInjury` | `CPRCriticalInjuryItem` |
| `cyberdeck` | `CPRCyberdeckItem` |
| `cyberware` | `CPRCyberwareItem` |
| `drug` | `CPRDrugItem` |
| `gear` | `CPRGearItem` |
| `itemUpgrade` | `CPRUpgradeItem` |
| `netarch` | `CPRNetArchItem` |
| `program` | `CPRProgramItem` |
| `role` | `CPRRoleItem` |
| `skill` | `CPRSkillItem` |
| `vehicle` | `CPRVehicleItem` |
| `weapon` | `CPRWeaponItem` |

---

## Data models

**`src/modules/datamodels/`**

Foundry V14 separates a document's schema (validation, defaults, migration) into a `DataModel` class registered on `CONFIG.*.dataModels`. CPR follows the pattern pioneered by the D&D 5e system.

### `CPRSystemDataModel` (base class)

`system-data-model.js` provides a mixin composer:

```js
class WeaponDataModel extends CPRSystemDataModel.mixin(
  AttackableSchema,
  EquippableSchema,
  PhysicalSchema,
  // ... more schema fragments
) {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      handsReq: new fields.NumberField({ integer: true, min: 1, max: 2 }),
    };
  }
}
```

`CPRSystemDataModel.mixin(...templates)` merges each template's `defineSchema()` output in order and chains `migrateData()` calls. Templates must expose:

- `static mixinName` — string identifier used to look up mixins at runtime.
- `static defineSchema()` — returns `foundry.data.fields.*` descriptors.
- (optional) `static migrateData(source)` — in-place pre-migration for legacy data.

### Schema mixin directory

`datamodels/item/mixins/` contains one schema file per capability:

| File | Capability |
|---|---|
| `attackable-schema.js` | Weapon attack data (range, ROF, DV table) |
| `common-schema.js` | Name / description fields shared by all items |
| `effects-schema.js` | `usage` field for active effect suppression |
| `electronic-schema.js` | `isElectronic`, `hardening` (EMP) |
| `equippable-schema.js` | Equip state (equipped, carried, owned) |
| `installable-schema.js` | Cyberware install slot |
| `loadable-schema.js` | Magazine capacity + loaded ammo |
| `physical-schema.js` | Weight |
| `quality-schema.js` | Poor / standard / excellent |
| `stackable-schema.js` | Quantity |
| `upgradable-schema.js` | Upgrade slots |
| `valuable-schema.js` | Price |

### Actor models

`datamodels/actor/` defines five models. The most complex is `character-datamodel.js`, which mixes `CommonSchema`, `ContainerSchema`, and `WealthSchema`, then adds lifepath, lifestyle, improvement points, and stat arrays.

### Legacy `template.json`

`src/template.json` is retained for backwards compatibility. The authoritative schema at runtime is the `DataModel` class, not `template.json`. Do not add new fields to `template.json`; add them to the appropriate `DataModel` instead.

---

## Item system: dual mixins

Items have two independent mixin layers that serve different purposes.

### Layer 1 — Schema mixins (data shape)

Located in `datamodels/item/mixins/`, these define the **Foundry DataModel schema** (field types, defaults, validation). They are mixed into `DataModel` classes at class-definition time via `CPRSystemDataModel.mixin(...)`.

### Layer 2 — Runtime mixins (behavior)

Located in `item/mixins/`, these attach **methods** to item instances at runtime. They are plain JavaScript objects/functions called via `SystemUtils.getMixins(type)` inside `CPRItem.prepareData()`:

```js
// cpr-item.js (simplified)
prepareData() {
  super.prepareData();
  const mixins = SystemUtils.getMixins(this.type);
  mixins.forEach((mixin) => mixin.call(this));
}
```

Each runtime mixin file exports a function that is called with `this` bound to the item instance. This gives items methods like `rollAttack()`, `loadAmmo()`, `equip()` without inheritance chains.

| Runtime mixin | Methods added |
|---|---|
| `cpr-attackable` | `rollAttack`, `getDVTable`, ammo management |
| `cpr-loadable` | `loadAmmo`, `unloadAmmo` |
| `cpr-equippable` | `equip`, `unequip`, `areEffectsSuppressed` |
| `cpr-installable` | `install`, `uninstall` |
| `cpr-container` | `getInstalledItems`, install trees |
| `cpr-effects` | `getActiveEffects`, `transferEffects` |
| `cpr-electronic` | EMP / hardening checks |

### Why two layers?

Schema mixins run at Foundry startup (class definition). They must be pure field descriptors. Runtime mixins provide behavior and can access game state. The separation keeps the DataModel layer free of side effects and easy to test.

---

## Actor sheets (Application V2)

All actor sheets have been migrated to Foundry's Application V2 (`HandlebarsApplicationMixin(ActorSheetV2)`). The key V2 differences from V1 are:

### Static `PARTS` and `TABS`

```js
static PARTS = {
  header: { template: "systems/cyberpunk-red-core/templates/actor/header.hbs" },
  tabs: { template: "templates/generic/tab-navigation.hbs" },
  skills: { template: "..." },
};
static TABS = {
  skills: { id: "skills", group: "primary", label: "..." },
};
```

### `_prepareContext(options)`

Replaces V1 `getData()`. Returns a plain object; Handlebars receives it as `{{context}}`.

### Listener lifecycle and `AbortController`

V2 calls `_onRender → activateListeners` on **every** render, including tab switches. Without cleanup, `addEventListener` calls stack on the same DOM nodes, degrading FPS.

CPR uses an `AbortController` per sheet instance:

```js
activateListeners(html) {
  // Abort any listeners from the previous render
  if (this._listenersAbort) this._listenersAbort.abort();
  this._listenersAbort = new AbortController();
  const { signal } = this._listenersAbort;

  html.querySelector(".rollable")?.addEventListener("click", this._onRoll.bind(this), { signal });
  // All listeners pass { signal }, so they are all removed on the next abort.
}
```

Subclasses (`CPRCharacterActorSheet`, etc.) call `super.activateListeners(html)` first and then attach their own handlers with the same shared `signal`.

### Delegated event handlers

For repeated elements (item rows, gear cards) CPR uses event delegation on a parent element rather than binding per-row:

```js
html.addEventListener("click", (event) => {
  const target = event.target.closest("[data-item-id]");
  if (!target) return;
  this._onItemAction(event, target.dataset.itemId);
}, { signal });
```

### Hook names

V2 fires `renderActorSheetV2` and `closeActorSheetV2` (not the V1 `renderActorSheet` / `closeActorSheet`). All CPR hooks under `hooks/actor/sheet/` use the V2 event names.

---

## Rolls pipeline

**`src/modules/rolls/`**

### Roll class hierarchy

`CPRRoll` extends Foundry `Roll` and adds:

- Critical success / failure detection (second d10 on a natural 10 or 1).
- Optional roll dialog via `handleRollDialog()` (skippable with Ctrl/Cmd).
- Automatic chat card rendering via `CPRChat.RenderRollCard()`.

Specialized subclasses inherit from `CPRRoll`:

| Class | Scenario |
|---|---|
| `CPRStatRoll` | Raw stat check (1d10 + stat value) |
| `CPRSkillRoll` | Skill check (1d10 + skill + stat) |
| `CPRAttackRoll` | Weapon attack |
| `CPRAimedAttackRoll` | Aimed shot |
| `CPRAutofireRoll` | Autofire |
| `CPRSuppressiveFireRoll` | Suppressive fire |
| `CPRInitiative` | Combat initiative |
| `CPRDeathSaveRoll` | Death save (no crit die) |
| `CPRDamageRoll` | Damage computation |
| `CPRRoleRoll` | Role ability roll |
| `CPRInterfaceRoll` | Netrunning interface action |
| `CPRHumanityLossRoll` | Humanity loss on cyberware |
| `CPRTableRoll` | Rollable table lookup |

### `CPRMod`

`CPRMod` (`cpr-modifiers.js`) is the bridge between Foundry `ActiveEffect` changes and the roll pipeline. Each change on a non-suppressed, non-disabled effect becomes a `CPRMod`:

```js
const mod = new CPRMod(activeEffect, change);
// mod.key        — e.g. "system.stats.ref.value"
// mod.value      — numeric modifier
// mod.changeType — "add" | "multiply" | "override" | ...
// mod.isSituational — show in roll dialog?
// mod.onByDefault   — situational mods pre-checked in dialog?
```

`CPRMod.getAllModifiers(actor.effects)` collects all active, non-suppressed mods. `CPRMod.getRelevantMods(mods, key)` filters to a specific stat/skill. `CPRMod.getSituationalRollMods(mods)` returns mods shown in the roll dialog.

---

## Active effects

**`src/modules/cpr-active-effect.js`** and **`src/modules/cpr-active-effect-sheet.js`**

See the dedicated [Active Effects guide](./ACTIVE-EFFECTS.md) for full details. Key architectural points:

- `CPRActiveEffect` extends Foundry `ActiveEffect`. It is registered as `CONFIG.ActiveEffect.documentClass`.
- `CONFIG.ActiveEffect.legacyTransferral = false` — item effects stay on the item; they are not copied to the owning actor automatically.
- **Suppression**: effects on items are suppressed when the item is not in an active usage state (e.g., unequipped weapon). Effects directly on actors are never suppressed.
- **Change types**: Foundry V14 uses string `change.type` (`"add"`, `"multiply"`, etc.) instead of numeric `change.mode`. All CPR code uses the string form. `CPRMod.normalizeChangeType()` handles legacy numeric values from older worlds.

---

## Hooks system

**`src/modules/hooks/`** and **`src/modules/system/hooks.js`**

Hook registrations are split into small, single-concern files rather than one large bootstrap. `system/hooks.js` maintains a manifest array and dynamically imports each file on `init`:

```js
// system/hooks.js
const hooksImports = [
  "actor/check-emp-and-luck.js",
  "actor/sheet/persist-section-views.js",
  // ...
];

export default async function registerHooks() {
  const modules = await Promise.all(
    hooksImports.map((path) => import(`../hooks/${path}`))
  );
  modules.forEach((m) => m.default()); // each file's default export is a registration function
}
```

Each hook file's default export is a **nullary function** that registers its Hooks.on/once listeners:

```js
// hooks/actor/check-emp-and-luck.js
export default function registerCheckEmpAndLuck() {
  Hooks.on("preUpdateActor", (actor, diff) => {
    // ...
  });
}
```

To add a new hook: create a file under `hooks/`, export a registration function as default, add its path to the `hooksImports` array in `system/hooks.js`.

---

## Migration system

**`src/modules/system/migrate/`**

The migration system updates actor and item data in an existing Foundry world when the data model version advances.

### How it works

1. `MigrationRunner` is instantiated in `cpr.js` `init` and stored at `game.cpr.MigrationRunner`.
2. On `ready` (GM only), `MigrationRunner.migrateWorld()` runs if `dataModelVersion < LATEST_VERSION`.
3. `MigrationRunner` discovers all scripts in `migrate/scripts/index.js` whose `static version` is greater than the current world version.
4. Each script extends `BaseMigrationScript` and overrides:
   - `static version` — the version this script migrates *to* (integer).
   - `static name` — human-readable name shown in the UI.
   - `static documentFilters` — which actor/item types to process.
   - `updateItem(item, actor)` — transform item data in-place.
   - `updateActor(actor)` — transform actor data in-place.
5. After all scripts run, `dataModelVersion` is updated and the changelog popup is shown.

### Adding a migration script

1. Create `src/modules/system/migrate/scripts/0NN-short-description.js` (next integer after `#LATEST_VERSION`).
2. Extend `BaseMigrationScript`, set `static version`, `static name`, `static documentFilters`.
3. Implement `updateItem` and/or `updateActor`.
4. Add an export to `scripts/index.js`.
5. Increment `#LATEST_VERSION` in `migration.js`.
6. Test by setting `dataModelVersion` to `version - 1` in a test world.

```js
// Example: 045-new-field.js
import BaseMigrationScript from "../base-migration-script.js";

export default class Migration045 extends BaseMigrationScript {
  static version = 45;
  static name = "Add new field to weapons";
  static documentFilters = {
    Item: { types: ["weapon"] },
  };

  updateItem(item) {
    if (item.system.newField === undefined) {
      item.system.newField = 0;
    }
  }
}
```

### Migration UI

`MigrationApp` (`migration-app.js`) shows a progress dialog during migration. `MigrationError` wraps errors with document context for reporting.

---

## Public API (`game.cpr.api`)

**`src/modules/api/`**

`game.cpr.api` is the stable surface for macros and external modules. It is initialized in `cpr.js` via `initalizeAPI()` from `api/initialize.js`.

### Namespaces

| Namespace | Members |
|---|---|
| `game.cpr.api.actor` | `getEMPableItems(actor)` — returns electronic items on the actor |
| `game.cpr.api.additions` | `createCover(...)`, `createTemplate(...)`, `createExplosiveTemplate(...)` |
| `game.cpr.api.import` | `runImportFlow(actor?)`, `fetchCharacter(code)`, `showImportDialog()`, `importCharacter(actor, data)`, `createAndImport(data)`, `loadItemDatabases()` |

### Adding a new API function

1. Create a file under `api/` exporting a named function.
2. Import it in `api/initialize.js` and add it to the returned object.

Actor API functions are auto-discovered if they are listed in the `modules` array in `_loadActorFunctions()` — add new actor helpers there.

---

## Build system

**`gulpfile.mjs`** and **`gulp/`**

| Task | Command | What it does |
|---|---|---|
| `build` | `npm run build` | `clean` → parallel asset pipeline |
| `watch` | `npm run watch` | Asset pipeline (no clean) + file watchers |
| `clean` | `npx gulp clean` | Delete `dist/` |
| `generatePacks` | `npx gulp generatePacks` | Build compendium LevelDB packs from `src/packs/` YAML |
| `extractPacks` | `npm run extractPacks` | Export built packs back to YAML |
| `generateBabele` | `npm run generateBabele` | Babele translation stubs |

### Output location (`gulp/config.mjs`)

- **Default:** `dist/`
- **With `foundryconfig.json`:** `dataPath/Data/systems/cyberpunk-red-core`
- Paths containing `.git` are rejected to prevent build artifacts inside the repository.

### CSS pipeline

`src/css/main.css` is processed by PostCSS (`postcss-import`, `postcss-mixins`, `postcss-nested`, `autoprefixer`) and written to `dist/`.

### Manifest stamping

`gulp/build.mjs` reads `package.json` for the version and stamps `system.json` with `version`, `manifest`, and `download` URLs before copying to `dist/`. Never edit these fields manually in `src/system.json`.

### `watch` skips `clean`

`npm run watch` deliberately does not clean `dist/` first. Wiping `dist/` while Foundry has open file descriptors on compendium pack databases (LevelDB) crashes the Foundry client. Always use `npm run build` for a clean rebuild when Foundry is not running, and `npm run watch` when iterating with Foundry open.
