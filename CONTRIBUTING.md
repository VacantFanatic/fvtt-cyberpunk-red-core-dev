# Contributing to Cyberpunk RED - CORE

Thank you for your interest in contributing! This guide covers the technical architecture, key patterns, and workflows developers need to understand before modifying the codebase.

## Contents

- [Development Environment](#development-environment)
- [CI Minimum Bar](#ci-minimum-bar)
- [Architecture Overview](#architecture-overview)
- [Document Classes and the Entity Factory](#document-classes-and-the-entity-factory)
- [Data Models and the Mixin System](#data-models-and-the-mixin-system)
- [Item Runtime Mixins](#item-runtime-mixins)
- [Application V2 Sheets](#application-v2-sheets)
- [Roll System](#roll-system)
- [Active Effects and CPRMod](#active-effects-and-cprmod)
- [Hooks Registration Pattern](#hooks-registration-pattern)
- [Chat Cards](#chat-cards)
- [Data Migrations](#data-migrations)
- [Adding a New Item Type](#adding-a-new-item-type)
- [Common Pitfalls](#common-pitfalls)

---

## Development Environment

For a full setup guide including Docker-based Foundry VTT, see [AGENTS.md](AGENTS.md).

Quick start:

```bash
npm ci
npm run build        # compile dist/
npm run lint         # ESLint
npm run stylelint    # Stylelint
npm run prettier     # Prettier check
```

All standard tasks are also available as `make` targets (`make build`, `make lint`, etc.).

---

## CI Minimum Bar

Every pull request must pass:

1. `npm ci`
2. Version sync check — `package.json` and `src/system.json` must have the same `version` string.
3. `npm run lint`
4. `npm run build`

Run all four locally before opening a PR.

---

## Architecture Overview

The system follows a layered design. Understanding the layers prevents confusion about where logic belongs.

```
Bootstrap (cpr.js)
  └── CONFIG.* registration: document classes, data models, sheets, combat
Data Layer
  └── DataModels (schema + validation) → CPRSystemDataModel.mixin(...)
Document Layer
  └── CPRActor / CPRItem subclasses (gameplay logic, lifecycle hooks)
  └── entity-factory.js Proxy routes Actor.create() / new Actor() by type
UI Layer
  └── CPRActorSheet / CPRItemSheet (Application V2: PARTS, TABS, AbortController)
  └── CPRDialog hierarchy (roll confirm, ledger, role dialogs)
Gameplay
  └── CPRRoll hierarchy (stat, skill, attack, damage, …)
  └── CPRMod (Active Effect changes → roll modifiers)
  └── CPRChat (roll cards, item cards, damage application)
Reactive glue
  └── hooks/* (individual Foundry Hooks.on registrations)
Public API
  └── game.cpr.api (actor utilities, canvas additions, import)
```

Key files:

| File | Role |
|------|------|
| `src/cpr.js` | Entry point; `Hooks.once("init")` and `"ready"` setup |
| `src/modules/entity-factory.js` | Proxy factory routing actor/item types to concrete classes |
| `src/modules/system/config.js` | System-wide constants (stats, roles, weapon types, DV tables) |
| `src/modules/system/settings.js` | `game.settings.register` calls |
| `src/modules/system/hooks.js` | Dynamic hook loader |

---

## Document Classes and the Entity Factory

Foundry expects a single `CONFIG.Actor.documentClass`. CPR supports six actor types and fifteen item types by routing construction through a `Proxy` in `entity-factory.js`.

```
Actor.create({ type: "character" })  →  entity-factory Proxy  →  CPRCharacterActor
Actor.create({ type: "blackIce" })   →  entity-factory Proxy  →  CPRBlackIceActor
```

### Actor class hierarchy

| Class | Extends | When to use |
|-------|---------|-------------|
| `CPRActor` | `Actor` | Base for character and mook; ~1,800 lines of shared logic |
| `CPRCharacterActor` | `CPRActor` | Player characters and named NPCs |
| `CPRMookActor` | `CPRActor` | Unnamed NPCs (unlinked tokens) |
| `CPRBlackIceActor` | `Actor` directly | Black ICE in net combat |
| `CPRDemonActor` | `Actor` directly | Demons in net combat |
| `CPRContainerActor` | `Actor` directly | Shops, loot containers |

**Important constraint:** Users can switch any actor between the character and mook *sheets* without changing `actor.type`. Code that is character-only must guard on the sheet type or use `instanceof CPRCharacterActor`. Conversely, code that feels character-specific (e.g. `calcMaxHp`, ledgers) lives on `CPRActor` so it works regardless of sheet.

### Item class hierarchy

All fifteen item types extend `CPRItem`. Most type subclasses are empty markers — their behaviour comes entirely from [runtime mixins](#item-runtime-mixins). The subclass file is still needed so the factory can route instantiation correctly.

---

## Data Models and the Mixin System

Schema validation for every actor and item type is defined by a `DataModel` class that extends `CPRSystemDataModel`, which itself extends `foundry.abstract.DataModel`.

`CPRSystemDataModel.mixin(...templates)` merges schema templates (borrowed from the dnd5e approach), enabling composition rather than deep inheritance.

```js
// src/modules/datamodels/item/weapon-datamodel.js
export default class WeaponDataModel extends CPRSystemDataModel.mixin(
  AttackableSchema,
  CommonSchema,
  ContainerSchema,
  EffectsSchema,
  EquippableSchema,
  LoadableSchema,
  PhysicalSchema,
  QualitySchema,
  UpgradableSchema,
  ValuableSchema
) { ... }
```

Each mixin class defines a static `mixinName` (e.g. `"equippable"`) and a `defineSchema()` that returns its `SchemaField` contributions. `CPRSystemDataModel.defineSchema()` merges all schema templates by iterating `_schemaTemplates`.

`SystemUtils.getMixins(type)` reads the data model's mixin names and returns the list needed to load runtime item mixins. When you add a new schema template, the runtime mixin system picks it up automatically as long as `mixinName` matches.

---

## Item Runtime Mixins

The data model mixin system handles schema. At runtime, *behaviour* is added via a separate set of mixins in `src/modules/item/mixins/`.

These are **plain functions** (not ES classes) called on the item instance:

```js
// Inside CPRItem.loadMixins()
const mixins = SystemUtils.getMixins(this.type); // e.g. ["attackable", "loadable", ...]
for (const mixin of mixins) {
  const fn = CPR_MIXINS[mixin];
  fn.call(this); // adds methods directly to `this`
}
```

Mixins and their capabilities:

| Mixin | Key methods added |
|-------|------------------|
| `cpr-attackable` | `_createAttackRoll`, `_weaponAction`, `dischargeItem` |
| `cpr-loadable` | `load`, `reload`, discharge tracking |
| `cpr-equippable` | `equip`, `unequip`, hand slot management |
| `cpr-installable` | install/uninstall into actors/containers |
| `cpr-container` | install tree management, `ContainerUtils` |
| `cpr-upgradable` | upgrade attachment, modifier aggregation |
| `cpr-effects` | item-granted Active Effects, usage mode toggling |
| `cpr-stackable` | quantity management |
| `cpr-quality` | quality modifier lookups |
| `cpr-valuable` | price/value fields |
| `cpr-physical` | weight, concealability |
| `cpr-electronic` | EMP vulnerability and hardening flags |

`CPRItem.prepareDerivedData()` calls `loadMixins()` on every data prep cycle, so mixin methods are always fresh.

---

## Application V2 Sheets

All actor and item sheets use Foundry's **Application V2** API (`HandlebarsApplicationMixin(ActorSheetV2 / ItemSheetV2)`).

### PARTS and TABS

Each sheet class declares static `PARTS` and optionally `TABS`:

```js
static PARTS = {
  sheet: {
    template: "systems/cyberpunk-red-core/templates/actor/cpr-character-sheet.hbs",
  },
};

static TABS = {
  right: {
    initial: "skills",
    tabs: [
      { id: "skills", label: "CPR.characterSheet.rightPane.skills.title" },
      { id: "gear",   label: "CPR.global.itemTypes.gear" },
      // …
    ],
  },
};
```

### Listener lifecycle and the AbortController pattern

Application V2 calls `_onRender` → `activateListeners` **on every render**, including tab switches and partial re-renders. Attaching new `addEventListener` calls on every render without cleanup causes duplicate listeners that degrade performance.

CPR solves this with `AbortController`:

```js
activateListeners(html) {
  const root = resolveSheetRoot(html) ?? resolveSheetRoot(this.element);
  if (!(root instanceof HTMLElement)) return;

  // Cancel all listeners from the previous render cycle.
  this._sheetListenersAbort?.abort();
  this._sheetListenersAbort = new AbortController();
  const { signal } = this._sheetListenersAbort;

  // All event listeners receive `{ signal }` so they are automatically
  // removed when `signal` is aborted on the next render.
  const onClick = (selector, listener) =>
    this._bindDelegatedClick(root, signal, selector, listener);

  onClick(".rollable", (event) => this._onRoll(event));
  onClick(".item-action", (event) => this._itemAction(event));
  // …

  root.addEventListener("keyup", handler, { signal });
}
```

**Rules for adding new listeners in a sheet:**

1. Always pass `{ signal }` from `this._sheetListenersAbort` to every `addEventListener` call.
2. Use delegated listeners (`_bindDelegatedClick`) for anything inside a tab — this ensures a single root listener rather than per-element listeners that must be re-attached on each render.
3. Subclasses that extend `CPRActorSheet` should call `super.activateListeners(html)` **after** their own bindings, and use the `_bindSubclassSheetClicks(onClick)` hook to inject delegated clicks into the base class's `activateListeners` pass.

### Data context — `_prepareContext`

Override `_prepareContext(options)` to add sheet-specific data. Always call and spread `super._prepareContext(options)` first:

```js
async _prepareContext(options) {
  const base = await super._prepareContext(options);
  return { ...base, myExtraData: computeMyData() };
}
```

### Form submission

`DEFAULT_OPTIONS.form.submitOnChange = true` means every input change auto-submits the form. The `closeOnSubmit: false` option keeps the sheet open. Do not manually call `submit()` for normal field edits.

---

## Roll System

All rolls extend `CPRRoll`. The hierarchy:

```
CPRRoll
├── CPRStatRoll
│   └── CPRSkillRoll
│       └── CPRAttackRoll
│           ├── CPRAimedAttackRoll
│           ├── CPRAutofireRoll
│           └── CPRSuppressiveFireRoll
├── CPRRoleRoll
│   └── CPRInterfaceRoll
├── CPRProgramStatRoll
├── CPRDeathSaveRoll
├── CPRDamageRoll
├── CPRHumanityLossRoll
├── CPRFacedownRoll
├── CPRInitiative
└── CPRTableRoll
```

### Typical attack flow

```
CPRActorSheet._onRoll(event)
  → item.createRoll("attack", actor)          // attackable mixin builds CPRAttackRoll
  → CPRMod.getAllModifiers(actor.effects)     // Active Effect changes → CPRMod[]
  → CPRMod.getRelevantMods(mods, "bonuses.x") // filter to relevant keys
  → cprRoll.addMod(mod)
  → cprRoll.handleRollDialog(event, actor, item)  // optional dialog for situational mods
  → await cprRoll.roll()                          // Foundry Roll + optional Dice So Nice
  → CPRChat.RenderRollCard(cprRoll)
```

### Critical rules

CPR implements critical hit/fail mechanics on every `1d10` roll:

- **Critical failure** — rolling the minimum face triggers an additional die roll; the extra result is *subtracted*.
- **Critical success** — rolling the maximum face triggers an additional die roll; the extra result is *added*.
- `CPRDamageRoll` on `d6`: rolling two or more sixes adds a +5 bonus.
- `CPRDeathSaveRoll` skips the critical die (`this.calculateCritical = false`).

### Adding modifiers to a roll

```js
const myMod = { value: 2, source: "Some Bonus", key: "bonuses.attack" };
cprRoll.addMod(myMod);
// Or remove:
cprRoll.removeMod(myMod);
// Total of all active mods:
cprRoll.totalMods();
```

---

## Active Effects and CPRMod

### Foundry V14+ change type strings

Foundry V14 deprecated numeric `CONST.ACTIVE_EFFECT_MODES` in favour of string `change.type` values. **Do not use `CONST.ACTIVE_EFFECT_MODES` anywhere in this codebase.**

Valid `change.type` strings: `"add"`, `"multiply"`, `"downgrade"`, `"upgrade"`, `"override"`, `"custom"`.

`CPRMod.normalizeChangeType(change)` handles both legacy numeric `change.mode` and the new string `change.type`, so existing data from older worlds remains compatible.

### How Active Effects reach rolls

```
actor.allApplicableEffects()
  → CPRMod.getAllModifiers(effects)     // non-suppressed, non-disabled changes → CPRMod[]
  → CPRMod.getRelevantMods(mods, key)  // filter by bonuses.* key
  → cprRoll.addMod(mod)
```

Modifier keys follow the `bonuses.<category>` scheme (e.g. `bonuses.universalAttack`, `bonuses.aimedShot`). The full list of keys is in `src/modules/system/config.js` under `CPR.activeEffectKeys`.

### Situational modifiers

Situational mods are Active Effect changes flagged `isSituational: true`. They appear as checkboxes in the roll confirmation dialog, letting the player toggle them per-roll. `CPRMod.getSituationalRollMods(rollData, effects, item, actor)` gathers these.

Core rulebook situational mods (e.g. aimed shot penalty, cover) are defined in `config.js` under `CPR.defaultSituationalMods` and loaded via `CPRMod.getDefaultSituationalMods()`.

### Writing suppression logic

Active effects on *items* can be suppressed when the item is unequipped or uninstalled. `CPRActiveEffect.isSuppressed` (computed in `prepareBaseData`) controls this. Override `isSuppressed` on the effect document — not the change values.

---

## Hooks Registration Pattern

Each hook module exports a **single default function** that calls `Hooks.on(...)`:

```js
// src/modules/hooks/actor/update-role-from-item.js
const UpdateRoleFromItem = () => {
  Hooks.on("createItem", async (doc) => {
    // …
  });
};
export default UpdateRoleFromItem;
```

`src/modules/system/hooks.js` dynamically imports a fixed list and calls each registration function at module load time (the bottom of `cpr.js`), **before** `Hooks.once("init")` fires. Keep hook files small and focused on one event or one concern.

To add a new hook:

1. Create `src/modules/hooks/<category>/my-hook.js` following the pattern above.
2. Add the relative path (e.g. `"category/my-hook.js"`) to the `hooksImports` array in `src/modules/system/hooks.js`.

---

## Chat Cards

`CPRChat` is a static utility class — it does not extend `ChatMessage`.

| Method | When to call |
|--------|-------------|
| `CPRChat.RenderRollCard(cprRoll)` | After `await cprRoll.roll()` to post the result |
| `CPRChat.RenderItemCard(item)` | Preview an item in chat (truncates descriptions > 5000 chars) |
| `CPRChat.RenderDamageApplicationCard(damageData)` | After `actor._applyDamage(...)` |
| `CPRChat.HandleCPRCommand(data)` | Called from the `/red` chat command hook |

Chat card click handlers (damage application, reverse damage, glyph buttons) are registered in `CPRChat.chatListeners(html)` and wired up in `src/modules/hooks/chat/`.

---

## Data Migrations

World data migrations run automatically on the GM client at `Hooks.once("ready")`. The migration system targets a `#LATEST_VERSION` number in `migration.js`; each world stores `dataModelVersion` in settings.

### Writing a migration script

1. Create `src/modules/system/migrate/scripts/NNN-my-migration.js`. Copy an existing script as a starting point.
2. Extend `BaseMigrationScript` and override `version`, `name`, `documentFilters`, and `updateActor` / `updateItem`.

```js
export default class MyMigration extends BaseMigrationScript {
  static version = 45;
  static name = "My migration description";

  static documentFilters = {
    Item: { types: ["weapon"], mixins: [] },
    Actor: { types: [], mixins: [] },
  };

  async updateItem(item) {
    // Return a plain object of changes; do NOT call item.update() here.
    return { "system.myNewField": item.system.oldField ?? "default" };
  }
}
```

3. Export from `src/modules/system/migrate/scripts/index.js`.
4. Increment `#LATEST_VERSION` in `migration.js`.
5. Test by loading a world that has not yet run the migration (set `dataModelVersion` in settings below the new version, or create a fresh world).

---

## Adding a New Item Type

Adding a new item type touches several files. Use an existing simple type (e.g. `gear`) as a template.

1. **Data model** — Create `src/modules/datamodels/item/my-type-datamodel.js` using `CPRSystemDataModel.mixin(...)`.
2. **Document class** — Create `src/modules/item/types/cpr-my-type.js` extending `CPRItem`. The file can be nearly empty if all behaviour comes from mixins.
3. **Entity factory** — Add `itemTypes.myType = CPRMyTypeItem` in `entity-factory.js`.
4. **Registration** — Add `CONFIG.Item.dataModels.myType = MyTypeDataModel` in `cpr.js`.
5. **Template** — Add a sheet template in `src/templates/item/`.
6. **Schema** — Add the type to `src/template.json` under `Item.types`.
7. **Default icon** — Add a fallback image entry in the `hooks/item/` default-image hook.
8. **Localization** — Add the type name to `src/lang/en.json`.
9. **Migration** — If the type has no prior data, no migration is needed. If it replaces an existing field, write a migration script.

---

## Common Pitfalls

**Duplicate event listeners after V2 re-renders**
Application V2 calls `activateListeners` on every render. Omitting `{ signal }` from `addEventListener` or skipping `this._sheetListenersAbort?.abort()` causes handlers to stack on every tab switch, causing input lag and incorrect behaviour.

**Using `CONST.ACTIVE_EFFECT_MODES`**
This was removed in Foundry V14. Use string types (`"add"`, `"multiply"`, etc.) and `CPRMod.normalizeChangeType(change)` when reading legacy data.

**Calling `item.update()` inside a migration script**
`BaseMigrationScript.updateItem(item)` must return a plain change object — the runner batches updates. Calling `update()` directly will break the migration transaction.

**Mutating `this.system` inside `prepareData`**
Always compute derived values through Foundry's preparation hooks (`prepareBaseData`, `prepareDerivedData`) and never mutate stored system data directly during those hooks.

**`foundryconfig.json` pointing inside the git repo**
Gulp will refuse to build if `dataPath` is set to a directory containing `.git`. Use the Docker volume path or a separate data directory.

**Version mismatch between `package.json` and `src/system.json`**
CI will fail. Update both files together; the release pipeline reads both.
