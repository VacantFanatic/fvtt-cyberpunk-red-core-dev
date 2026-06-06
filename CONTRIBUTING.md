# Contributing to Cyberpunk RED - CORE

Technical architecture, key patterns, and workflows for modifying the codebase.

## Contents

- [Related documentation](#related-documentation)
- [Development environment](#development-environment)
- [CI minimum bar](#ci-minimum-bar)
- [Architecture overview](#architecture-overview)
- [Document classes and the entity factory](#document-classes-and-the-entity-factory)
- [Data models and the mixin system](#data-models-and-the-mixin-system)
- [Item runtime mixins](#item-runtime-mixins)
- [Application V2 sheets](#application-v2-sheets)
- [Roll system](#roll-system)
- [Active Effects and CPRMod](#active-effects-and-cprmod)
- [Hooks registration pattern](#hooks-registration-pattern)
- [Chat cards](#chat-cards)
- [Data migrations](#data-migrations)
- [Adding a new item type](#adding-a-new-item-type)
- [Common pitfalls](#common-pitfalls)

## Related documentation

| Document                                         | What it covers                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)     | Setup, watch workflow, code style, task checklists, PR checklist |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)     | Module map, build pipeline, extended architecture reference      |
| [docs/ACTIVE-EFFECTS.md](docs/ACTIVE-EFFECTS.md) | Effect keys, suppression, situational mods, troubleshooting      |
| [AGENTS.md](AGENTS.md)                           | Docker Foundry, cloud agent setup, CI commands                   |

## Development environment

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for prerequisites, `foundryconfig.json`, watch/clean workflow, and manual testing. See [AGENTS.md](AGENTS.md) for the Docker Foundry stack (`foundry-docker.sh`, `sync-system`).

Quick start:

```bash
npm ci && npm run build && npm run lint
```

## CI minimum bar

Every pull request must pass the steps in [AGENTS.md](AGENTS.md) (mirrored in [`.github/workflows/ci.yml`](.github/workflows/ci.yml)): `npm ci`, version sync between `package.json` and `src/system.json`, `npm run lint`, and `npm run build`.

## Architecture overview

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

| File                             | Role                                                          |
| -------------------------------- | ------------------------------------------------------------- |
| `src/cpr.js`                     | Entry point; `Hooks.once("init")` and `"ready"` setup         |
| `src/modules/entity-factory.js`  | Proxy factory routing actor/item types to concrete classes    |
| `src/modules/system/config.js`   | System-wide constants (stats, roles, weapon types, DV tables) |
| `src/modules/system/settings.js` | `game.settings.register` calls                                |
| `src/modules/system/hooks.js`    | Dynamic hook loader                                           |

## Document classes and the entity factory

Foundry expects a single `CONFIG.Actor.documentClass`. CPR registers **five** actor `type` values and **fifteen** item types, routing construction through a `Proxy` in `entity-factory.js`. `CPRActor` is the shared base class for character and mook types, not a separate `data.type`.

```
Actor.create({ type: "character" })  →  entity-factory Proxy  →  CPRCharacterActor
Actor.create({ type: "blackIce" })   →  entity-factory Proxy  →  CPRBlackIceActor
```

### Actor class hierarchy

| Class               | Extends          | When to use                                               |
| ------------------- | ---------------- | --------------------------------------------------------- |
| `CPRActor`          | `Actor`          | Base for character and mook; ~1,800 lines of shared logic |
| `CPRCharacterActor` | `CPRActor`       | Player characters and named NPCs                          |
| `CPRMookActor`      | `CPRActor`       | Unnamed NPCs (unlinked tokens)                            |
| `CPRBlackIceActor`  | `Actor` directly | Black ICE in net combat                                   |
| `CPRDemonActor`     | `Actor` directly | Demons in net combat                                      |
| `CPRContainerActor` | `Actor` directly | Shops, loot containers                                    |

**Important constraint:** Users can switch any actor between the character and mook _sheets_ without changing `actor.type`. Code that is character-only must guard on the sheet type or use `instanceof CPRCharacterActor`. Conversely, code that feels character-specific (e.g. `calcMaxHp`, ledgers) lives on `CPRActor` so it works regardless of sheet.

### Item class hierarchy

All fifteen item types extend `CPRItem`. Most type subclasses are empty markers whose behaviour comes from [runtime mixins](#item-runtime-mixins); the subclass file is still required for factory routing.

## Data models and the mixin system

Schema validation for every actor and item type is defined by a `DataModel` class that extends `CPRSystemDataModel`, which itself extends `foundry.abstract.DataModel`.

`CPRSystemDataModel.mixin(...templates)` merges schema templates (borrowed from the dnd5e approach), enabling composition rather than deep inheritance.

```js
// src/modules/datamodels/item/weapon-datamodel.js
export default class WeaponDataModel extends CPRSystemDataModel.mixin(
  AttackableSchema,
  CommonSchema,
  EquippableSchema,
  LoadableSchema
  // …see weapon-datamodel.js for the full mixin list
) { ... }
```

Each mixin class defines a static `mixinName` (e.g. `"equippable"`) and a `defineSchema()` that returns its `SchemaField` contributions. `CPRSystemDataModel.defineSchema()` merges all schema templates by iterating `_schemaTemplates`.

`SystemUtils.getMixins(type)` reads the data model's mixin names and returns the list needed to load runtime item mixins. When you add a new schema template, the runtime mixin system picks it up automatically as long as `mixinName` matches.

## Item runtime mixins

The data model mixin system handles schema. At runtime, _behaviour_ is added via plain functions in `src/modules/item/mixins/`:

```js
// Inside CPRItem.loadMixins() — see cpr-item.js for the full switch
const mixins = SystemUtils.getMixins(this.type); // e.g. ["attackable", "loadable", ...]
for (const mixin of mixins) {
  switch (mixin) {
    case "attackable":
      Attackable.call(this);
      break;
    // …
  }
}
```

| Mixin         | Key methods added                                     |
| ------------- | ----------------------------------------------------- |
| `attackable`  | `_createAttackRoll`, `_weaponAction`, `dischargeItem` |
| `loadable`    | `load`, `reload`, discharge tracking                  |
| `equippable`  | `equip`, `unequip`, hand slot management              |
| `installable` | install/uninstall into actors/containers              |
| `container`   | install tree management, `ContainerUtils`             |
| `upgradable`  | upgrade attachment, modifier aggregation              |
| `effects`     | item-granted Active Effects, usage mode toggling      |
| `stackable`   | quantity management                                   |
| `quality`     | quality modifier lookups                              |
| `valuable`    | price/value fields                                    |
| `physical`    | weight, concealability                                |
| `electronic`  | EMP vulnerability and hardening flags                 |

`CPRItem.prepareDerivedData()` calls `loadMixins()` on every data-prep cycle (matching the dnd5e pattern). Keep mixin bodies lightweight — expensive work here runs for every item whenever actor data is prepared.

## Application V2 sheets

All actor and item sheets use Foundry's **Application V2** API (`HandlebarsApplicationMixin(ActorSheetV2 / ItemSheetV2)`).

### PARTS and TABS

Each sheet class declares static `PARTS` and optionally `TABS` — see `cpr-character-sheet.js` for a full example.

```js
static PARTS = {
  sheet: {
    template: "systems/cyberpunk-red-core/templates/actor/cpr-character-sheet.hbs",
  },
};
```

### Listener lifecycle and the AbortController pattern

Application V2 calls `_onRender` → `activateListeners` **on every render**, including tab switches and partial re-renders. Attaching listeners without cleanup causes duplicate handlers and input lag.

CPR actor sheets use `AbortController` in `CPRActorSheet.activateListeners`:

```js
this._sheetListenersAbort?.abort();
this._sheetListenersAbort = new AbortController();
const { signal } = this._sheetListenersAbort;
const onClick = (selector, listener) =>
  this._bindDelegatedClick(root, signal, selector, listener);
onClick(".rollable", (event) => this._onRoll(event));
root.addEventListener("keyup", handler, { signal });
```

**Rules for adding new listeners in a sheet:**

1. Always pass `{ signal }` from `this._sheetListenersAbort` to every `addEventListener` call.
2. Use delegated listeners (`_bindDelegatedClick`) for tab content — one root listener instead of per-element bindings on each render.
3. Subclasses extend via `_bindSubclassSheetClicks(onClick)` (called from the base `activateListeners`). Call `super.activateListeners(html)` first if you need additional listeners with the shared `signal` (see `cpr-character-sheet.js`). Item sheets use `_itemSheetListenersAbort` in `cpr-item-sheet.js`.

### Data context — `_prepareContext`

Override `_prepareContext(options)` to add sheet-specific data. Always call and spread `super._prepareContext(options)` first. Avoid expensive per-render work here — the base path already enriches HTML and prepares effect categories.

```js
async _prepareContext(options) {
  const base = await super._prepareContext(options);
  return { ...base, myExtraData: computeMyData() };
}
```

### Form submission

`CPRActorSheet` sets `DEFAULT_OPTIONS.form.submitOnChange = true`, so input changes auto-submit and trigger data prep. `closeOnSubmit: false` keeps the sheet open. Some subclasses (e.g. `CPRCharacterActorSheet`) disable `submitOnChange`. Do not manually call `submit()` for normal field edits.

## Roll system

All rolls extend `CPRRoll`. See `src/modules/rolls/` for the full class hierarchy (`CPRStatRoll` → `CPRSkillRoll` → `CPRAttackRoll`, plus damage, initiative, role rolls, etc.).

### Typical attack flow

```
CPRActorSheet._onRoll(event)
  → item.createRoll("attack", actor)              // attackable mixin builds CPRAttackRoll
  → CPRMod.getAllModifiers(actor.allApplicableEffects())
  → CPRMod.getRelevantMods(mods, "universalAttack") // key without "bonuses." prefix
  → cprRoll.addMod([mod])
  → cprRoll.handleRollDialog(event, actor, item)
  → await cprRoll.roll()
  → CPRChat.RenderRollCard(cprRoll)
```

Batch effect-to-mod conversion once per roll (`getAllModifiers` on the full effect set), then filter by key — avoid calling `getAllModifiers` per effect.

### Critical rules

CPR implements critical hit/fail mechanics on every `1d10` roll:

- **Critical failure** — rolling the minimum face triggers an additional die roll; the extra result is _subtracted_.
- **Critical success** — rolling the maximum face triggers an additional die roll; the extra result is _added_.
- `CPRDamageRoll` on `d6`: rolling two or more sixes adds a +5 bonus.
- `CPRDeathSaveRoll` skips the critical die (`this.calculateCritical = false`).

### Adding modifiers to a roll

```js
const myMod = { value: 2, source: "Some Bonus", key: "bonuses.attack" };
cprRoll.addMod([myMod]); // addMod expects an array
cprRoll.removeMod(myMod.id); // removeMod takes a mod id string
cprRoll.totalMods();
```

## Active Effects and CPRMod

See [docs/ACTIVE-EFFECTS.md](docs/ACTIVE-EFFECTS.md) for the full key reference, effect-sheet UI, and troubleshooting.

### Foundry V14+ change type strings

Foundry V14 deprecated numeric `CONST.ACTIVE_EFFECT_MODES` in favour of string `change.type` values. **Do not use `CONST.ACTIVE_EFFECT_MODES` anywhere in this codebase.**

Valid `change.type` strings: `"add"`, `"multiply"`, `"downgrade"`, `"upgrade"`, `"override"`, `"custom"`.

`CPRMod.normalizeChangeType(change)` handles both legacy numeric `change.mode` and the new string `change.type`, so existing data from older worlds remains compatible.

### How Active Effects reach rolls

```
actor.allApplicableEffects()
  → CPRMod.getAllModifiers(effects)
  → CPRMod.getRelevantMods(mods, "universalAttack")
  → cprRoll.addMod([mod])
```

Modifier keys follow the `bonuses.<category>` scheme (e.g. `bonuses.universalAttack`, `bonuses.aimedShot`). The full list is in `src/modules/system/config.js` under `CPR.activeEffectKeys`.

### Suppression

Active effects on _items_ can be suppressed when the item is unequipped or uninstalled. `CPRActiveEffect.determineSuppression()` (called from `CPRActor.applyActiveEffects()`) sets `system.isSuppressed` based on `doc.areEffectsSuppressed()` from the equippable mixin — do not mutate change values to simulate suppression.

## Hooks registration pattern

Each hook module exports a **single default function** that calls `Hooks.on(...)`:

```js
// src/modules/hooks/actor/update-role-from-item.js
const UpdateRoleFromItem = () => {
  Hooks.on("createItem", async (doc) => {
    /* … */
  });
};
export default UpdateRoleFromItem;
```

`src/modules/system/hooks.js` dynamically imports a fixed list and calls each registration function at module load time (bottom of `cpr.js`), **before** `Hooks.once("init")` fires. Keep hook files small and focused on one event or one concern. Batch document updates where possible to avoid update→hook→update cascades.

To add a new hook:

1. Create `src/modules/hooks/<category>/my-hook.js` following the pattern above.
2. Add the relative path (e.g. `"category/my-hook.js"`) to the `hooksImports` array in `src/modules/system/hooks.js`.

## Chat cards

`CPRChat` is a static utility class — it does not extend `ChatMessage`.

| Method                                            | When to call                                                  |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `CPRChat.RenderRollCard(cprRoll)`                 | After `await cprRoll.roll()` to post the result               |
| `CPRChat.RenderItemCard(item)`                    | Preview an item in chat (truncates descriptions > 5000 chars) |
| `CPRChat.RenderDamageApplicationCard(damageData)` | After `actor._applyDamage(...)`                               |
| `CPRChat.HandleCPRCommand(data)`                  | Called from the `/red` chat command hook                      |

Chat card click handlers are registered in `CPRChat.chatListeners(html)` and wired up in `src/modules/hooks/chat/`.

## Data migrations

World data migrations run automatically on the GM client at `Hooks.once("ready")`. The migration system targets `#LATEST_VERSION` (currently **44**) in `migration.js`; each world stores `dataModelVersion` in settings.

### Writing a migration script

1. Create `src/modules/system/migrate/scripts/NNN-my-migration.js` (zero-padded numeric prefix). Copy an existing script as a starting point.
2. Extend `BaseMigrationScript` and override `version`, `name`, `documentFilters`, and `updateActor` / `updateItem`.
3. Export from `src/modules/system/migrate/scripts/index.js`.
4. Increment `#LATEST_VERSION` in `migration.js`.
5. Test by loading a world that has not yet run the migration.

```js
// Pattern from 044-active-effect-change-type.js
export default class MyMigration extends BaseMigrationScript {
  static version = 45;
  static name = "My migration description";

  async updateItem(itemData) {
    // Mutate itemData in place — do NOT call item.update() here.
    itemData.system.myNewField = itemData.system.oldField ?? "default";
  }
}
```

## Adding a new item type

See [docs/CONTRIBUTING.md — Adding a new item type](docs/CONTRIBUTING.md#adding-a-new-item-type) for the full checklist. Summary:

1. **Data model** — `src/modules/datamodels/item/my-type-datamodel.js` using `CPRSystemDataModel.mixin(...)`.
2. **Document class** — `src/modules/item/types/cpr-my-type.js` extending `CPRItem`.
3. **Entity factory** — `itemTypes.myType = CPRMyTypeItem` in `entity-factory.js`.
4. **Registration** — `CONFIG.Item.dataModels.myType = MyTypeDataModel` in `cpr.js`.
5. **Template** — sheet template in `src/templates/item/`.
6. **`system.json`** — add the type to `documentTypes`.
7. **`template.json`** — stub entry only (DataModel is authoritative; do not add new fields here).
8. **Default icon** — `src/modules/hooks/item/set-default-image.js`.
9. **Localization** — type name in `src/lang/en.json`.
10. **Migration** — only if replacing existing data.

## Common pitfalls

| Pitfall                                  | Guidance                                                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate sheet listeners                | See [Application V2 sheets → Listener lifecycle](#listener-lifecycle-and-the-abortcontroller-pattern). Omitting `{ signal }` stacks handlers on every tab switch. |
| `CONST.ACTIVE_EFFECT_MODES`              | Use string types and `CPRMod.normalizeChangeType(change)`. See [Active Effects](#active-effects-and-cprmod).                                                      |
| `item.update()` in migrations            | Mutate `itemData` / `actorData` in place; the runner batches updates. See [Data migrations](#data-migrations).                                                    |
| Mutating `this.system` in `prepareData`  | Compute derived values in `prepareBaseData` / `prepareDerivedData`; do not mutate stored system data.                                                             |
| `foundryconfig.json` inside the git repo | Gulp refuses `dataPath` under `.git`. See [AGENTS.md](AGENTS.md).                                                                                                 |
| Version mismatch                         | Keep `package.json` and `src/system.json` in sync. See [CI minimum bar](#ci-minimum-bar).                                                                         |
| Heavy mixin or `_prepareContext` work    | Runs on every data prep / render — profile before adding expensive logic.                                                                                         |
