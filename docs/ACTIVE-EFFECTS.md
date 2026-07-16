# Active effects guide

This document explains how Foundry's Active Effects system is used in CPR, covering suppression, the V14 change-type migration, `CPRMod`, the roll dialog integration, and how to add new effect keys.

## Table of contents

- [Overview](#overview)
- [CPRActiveEffect](#cpractiveffect)
  - [Suppression](#suppression)
  - [Change types (V14 migration)](#change-types-v14-migration)
- [CPRActiveEffectSheet](#cpractive-effectsheet)
- [CPRMod](#cprmod)
  - [Situational modifiers](#situational-modifiers)
  - [How CPRMod feeds rolls](#how-cprmod-feeds-rolls)
- [Effect key reference](#effect-key-reference)
- [Adding a new effect key](#adding-a-new-effect-key)
- [Troubleshooting](#troubleshooting)

---

## Overview

Active Effects in CPR work the same way as in core Foundry: each `ActiveEffect` document holds an array of `changes`, each of which modifies a specific property on an actor when the effect is active. CPR layers on:

- **Suppression** — effects on items are silenced when the item is not in active use.
- **Situational modifiers** — some changes only apply in specific circumstances and appear as checkboxes in the roll dialog.
- **Key categories** — the effect sheet groups keys by category (combat, skill, stat, etc.) to make it easier to find the right key.
- **V14 change-type strings** — Foundry V14 replaced the legacy numeric `mode` with a string `type`; CPR handles both transparently.

The two relevant source files are:

| File | Purpose |
|---|---|
| `src/modules/cpr-active-effect.js` | `CPRActiveEffect` document class |
| `src/modules/cpr-active-effect-sheet.js` | `CPRActiveEffectSheet` config UI |
| `src/modules/rolls/cpr-modifiers.js` | `CPRMod` — bridge to the roll pipeline |

---

## CPRActiveEffect

`CPRActiveEffect` extends Foundry's `ActiveEffect` and is registered as `CONFIG.ActiveEffect.documentClass` in `cpr.js`.

```js
// cpr.js
CONFIG.ActiveEffect.documentClass = CPRActiveEffect;
CONFIG.ActiveEffect.legacyTransferral = false;
```

Setting `legacyTransferral = false` prevents Foundry from automatically promoting item-owned effects to actor-owned effects when an item is added to an actor. Effects stay on the item document and are applied from there. This is how CPR implements item-based bonuses: equip the item, its effects become active; unequip it, they are suppressed.

### Suppression

`CPRActiveEffect` adds a `system.isSuppressed` flag. When `true`, the effect's `apply()` is a no-op:

```js
apply(actor, change) {
  if (this.system.isSuppressed) return null;
  return super.apply(actor, change);
}
```

Suppression is computed by `determineSuppression()`, called during actor data preparation:

```js
determineSuppression() {
  this.system.isSuppressed = false;
  if (this.disabled) return;
  const doc = this.parent;
  if (!doc) return;                    // happens during item deletion
  if (doc instanceof CPRActor) return; // actor-owned effects are never suppressed
  this.system.isSuppressed = doc.areEffectsSuppressed();
}
```

`areEffectsSuppressed()` is provided by the **`cpr-equippable`** runtime mixin on items. For example, on a weapon it returns `true` when the weapon is not in an active usage state (carried vs. equipped vs. toggled).

**Effect `usage` field:** The `effects-schema.js` mixin adds a `usage` field to items that own effects. The `CPRActiveEffect.usage` getter reads `this.parent.system.usage`. The active effect config sheet exposes this as a dropdown so GMs can control when the effect is active.

Usage values:

| Value | When the effect is active |
|---|---|
| `equipped` | The item is equipped (default for weapons, armor) |
| `carried` | The item is in the character's inventory at all |
| `toggled` | Manually toggled by the player |
| `installed` | The cyberware is installed |
| `isWorn` | Clothing is worn |

### Change types (V14 migration)

Foundry V13 used a numeric `change.mode` (0–5, matching `CONST.ACTIVE_EFFECT_MODES`). Foundry V14 replaced this with a string `change.type`. `CONST.ACTIVE_EFFECT_MODES` was removed and must not be referenced.

CPR uses string types everywhere. The `CPRMod.normalizeChangeType()` static method handles legacy world data gracefully:

```js
// cpr-modifiers.js
const LEGACY_MODE_TO_TYPE = Object.freeze({
  0: "custom",
  1: "multiply",
  2: "add",
  3: "downgrade",
  4: "upgrade",
  5: "override",
});

static normalizeChangeType(change) {
  if (change?.type != null && String(change.type).trim() !== "") {
    return String(change.type).toLowerCase(); // V14+ path
  }
  const legacy = change?.mode;
  if (typeof legacy === "number" && LEGACY_MODE_TO_TYPE[legacy] !== undefined) {
    return LEGACY_MODE_TO_TYPE[legacy]; // V13 legacy path
  }
  return "add"; // safe fallback
}
```

Migration script **044** (`src/modules/system/migrate/scripts/044-active-effect-change-type.js`) converts all stored `change.mode` numeric values to the string `change.type` on existing world data. This runs automatically on world load for GMs when upgrading from V13.

**Rule:** Never write `change.mode` or reference `CONST.ACTIVE_EFFECT_MODES` in new code. Use `change.type` with a lowercase string, e.g. `"add"`.

---

## CPRActiveEffectSheet

`CPRActiveEffectSheet` extends `ActiveEffectConfig` (Foundry's built-in effect editor). It replaces the default change key input with a category-aware UI:

1. The user picks a **category** (combat, skill, stat, role, netrun, misc, custom).
2. Based on the category, the key field becomes:
   - **skill** → a `<select>` populated from the actor's skill items.
   - **custom** → a free-text `<input>`.
   - **other categories** → a `<select>` from `CPR.activeEffectKeys[category]` in `config.js`.
3. Each change also exposes **Situational** and **On by default** checkboxes stored in `flags.cyberpunk-red-core.changes.situational[N]`.

The sheet force-submits when the category changes (via the `force-submit` CSS class) to ensure the key and flags are consistent.

---

## CPRMod

`CPRMod` (`src/modules/rolls/cpr-modifiers.js`) is the bridge between an `ActiveEffect` change and the roll pipeline. Each change on a non-suppressed, non-disabled effect is wrapped in a `CPRMod` instance.

```js
const mod = new CPRMod(activeEffect, change);
```

### CPRMod properties

| Property | Type | Description |
|---|---|---|
| `key` | string | Effect change key (e.g. `"bonuses.universalAttack"`) |
| `value` | number | Numeric modifier value |
| `changeType` | string | Foundry change type: `"add"`, `"multiply"`, `"override"`, etc. |
| `source` | string | Effect name (shown in the roll dialog) |
| `category` | string | Key category set via `CPRActiveEffect.setModKeyCategory()` |
| `isSituational` | boolean | Whether this mod appears in the roll dialog |
| `onByDefault` | boolean | Whether the situational mod is pre-checked in the roll dialog |
| `id` | string | Unique id (`key-effectId`; one change key per effect is enforced) |

### Static helpers

```js
// Get all CPRMods from a list of effects (non-suppressed, non-disabled)
const allMods = CPRMod.getAllModifiers(actor.effects);

// Filter to mods relevant for a specific key
const attackMods = CPRMod.getRelevantMods(allMods, "universalAttack");

// Get situational mods for a specific roll type + actor context
const situationalMods = CPRMod.getSituationalRollMods(rollData, actor.effects, item, actor);

// Get the hardcoded situational modifiers from config.js (p. 130 core book)
const defaultMods = CPRMod.getDefaultSituationalMods();
```

### Situational modifiers

A *situational* modifier is a bonus that only applies in specific circumstances (e.g., "I'm aiming at a stationary target"). GMs and players configure whether a modifier is situational and whether it should be on by default using the checkboxes in the active effect sheet.

Situational mods appear as checkboxes in the **roll dialog** (`CPRRollDialog`). The player checks or unchecks them before rolling. Only checked situational mods are included in the final roll total.

`CPRMod.getSituationalRollMods()` filters situational mods based on the roll subclass (e.g., only attack keys appear for `CPRAttackRoll`). The filtering logic checks the roll's prototype chain:

- `CPRAttackRoll` — includes `bonuses.universalAttack`, `bonuses.melee`/`bonuses.ranged`, fire-mode-specific keys, and weapon upgrade mods.
- `CPRSkillRoll` — includes skill-specific keys and role bonus mods.
- `CPRInitiative` — includes `bonuses.initiative` and role initiative mods.
- `CPRDamageRoll` — includes `bonuses.universalDamage` and weapon damage mods.
- `CPRDeathSaveRoll` — includes `bonuses.deathSavePenalty`.

### How CPRMod feeds rolls

```
1. Actor sheet or item triggers a roll (e.g., CPRSkillRoll)
2. CPRRoll.handleRollDialog() opens CPRRollDialog
3. CPRRollDialog calls CPRMod.getSituationalRollMods() to populate checkboxes
4. User checks desired mods and clicks Roll
5. Dialog resolves with the selected mods
6. CPRRoll applies the mod values to the roll formula
7. CPRChat.RenderRollCard() renders the result to chat
```

Non-situational mods (permanent bonuses from equipped items) are applied directly to the relevant stat or skill value via Foundry's normal Active Effect `apply()` mechanism — they never appear in the roll dialog.

---

## Effect key reference

Effect keys are namespaced under `bonuses.*` for CPR-specific bonuses or `system.*` for direct data model paths.

### Combat keys (`bonuses.*`)

| Key | Effect |
|---|---|
| `bonuses.universalAttack` | Bonus to all attack rolls |
| `bonuses.universalDamage` | Bonus to all damage rolls |
| `bonuses.universalDamageReduction` | Damage reduction (all sources) |
| `bonuses.aimedShot` | Aimed shot attack bonus |
| `bonuses.singleShot` | Single shot attack bonus |
| `bonuses.melee` | Melee attack bonus |
| `bonuses.ranged` | Ranged attack bonus |
| `bonuses.autofire` | Autofire attack/skill bonus |
| `bonuses.suppressive` | Suppressive fire bonus |
| `bonuses.initiative` | Initiative bonus |
| `bonuses.maxHp` | Maximum HP modifier |
| `bonuses.maxHumanity` | Maximum humanity modifier |
| `bonuses.deathSavePenalty` | Death save penalty |
| `bonuses.hands` | Number of usable hands |
| `bonuses.run` | Run speed modifier |
| `bonuses.walk` | Walk speed modifier |
| `bonuses.allActions` | Bonus to all action rolls |
| `bonuses.allActionsSpeech` | Bonus to all speech action rolls |
| `bonuses.allActionsHands` | Bonus to all hand-based action rolls |

### Netrunning keys (`bonuses.*`)

`bonuses.attack`, `bonuses.defense`, `bonuses.brainDamageReduction`, `bonuses.perception_net`, `bonuses.rez`, `bonuses.speed`, and each interface ability: `bonuses.backdoor`, `bonuses.cloak`, `bonuses.control`, `bonuses.eyedee`, `bonuses.pathfinder`, `bonuses.scanner`, `bonuses.slide`, `bonuses.virus`, `bonuses.zap`.

### Skill keys (`bonuses.*`)

One key per skill, `bonuses.<slugifiedSkillName>`. Skill names are slugified with `SystemUtils.slugify()` (camelCase, spaces removed). For example: `bonuses.athletics`, `bonuses.handgun`, `bonuses.perception`. Perception also has `bonuses.perceptionHearing` and `bonuses.perceptionSight` sub-keys.

The full list is in `CPR.activeEffectKeys.skill` in `src/modules/system/config.js`.

### Stat keys (`system.stats.*`)

Direct data model paths for stat values, e.g.:
- `system.stats.ref.value`
- `system.stats.int.value`
- `system.stats.body.value`

These are applied by Foundry's standard effect mechanism (not `bonuses.*`) and modify the stat directly on the actor document.

### Role ability keys (`bonuses.*`)

One key per role ability, e.g. `bonuses.combatAwareness`, `bonuses.interface`, `bonuses.medicine`. Full list in `CPR.activeEffectKeys.role`.

### Token keys (`token.*`, V14+ only)

Foundry V14 added a native `token.` change-key prefix: the prefix is stripped
and the remaining path (e.g. `light.bright`, `light.dim`, `sight.range`) is
applied directly to the actor's placed/prototype `TokenDocument`(s) during
data preparation, via the actor's new `tokenOverrides` field — the same
mechanism core already used to apply `system.*`/`bonuses.*` changes to the
actor itself. This replaces the third-party **ATL** (Active Token Lighting)
module's `ATL.*` prefix convention one-for-one for the same underlying
`LightData`/`TokenDocument` schema paths — no dependency on ATL is required.

`token.light.bright` is used by the Flashlight, Glow Stick, and Road Flare
gear items (`src/packs/core/gear/effect.*.yaml`) to make the item's toggle
effect emit light from the wielder's token. `token.light.dim` is the same
idea for weaker ambient-glow sources — used by the Flashlight Cyberfinger
(`src/packs/black-chrome/cyberware/effect.flashlight.cyberfinger.*.yaml`),
Lead's Turn-On-Show-Off Nails
(`src/packs/dlc/cyberware/effect.leads_turn_on_show_off_nails.*.yaml`), Glow
Paint (`src/packs/core/gear/effect.glow.paint.*.yaml`), and the Light Tattoo
(`src/packs/core/cyberware/effect.light.tattoo.*.yaml` — added as a second
`changes[]` entry alongside its existing `bonuses.wardrobeAndStyle` change,
since one item can carry both a skill bonus and a token change on the same
effect). These are **custom**-category effects (free-text key, not in
`CPR.activeEffectKeys`), so each new key also has to be added to the
`changes[].key` enum in `schema/activeEffects.json` for `npx v8r` pack
validation to accept it.

`token.sight.visionMode` (an `override`-type change, since it targets a
string field rather than a number) is used by the Low Light/IR/UV cyberware
(`src/packs/core/cyberware/effect.low.lightiruv.*.yaml`) and the Infrared
Nightvision Scope item upgrade
(`src/packs/core/upgrades/effect.infrared.nightvision.scope.*.yaml`) to set
the wielder's token to Foundry's built-in `"lightAmplification"` vision mode
(`CONFIG.Canvas.visionModes` — sees light sources brightened and darkness
lifted). This only covers the "darkness" part of each item's description;
Foundry has no built-in vision mode for "ignore smoke/fog penalties", so that
part of the flavor text stays unimplemented rather than overclaimed.

A vision *mode* only changes how light is perceived within the token's
existing `sight.range` — it grants no sight distance on its own, so both
effects also carry a second, paired change: `token.sight.range` (`override`,
value `"18"`). Foundry's `sight.range` is a plain number interpreted in
whatever unit the **scene's own grid** is configured for, not a fixed
real-world distance — this system's default new-scene grid is 2 meters/square
(`grid.units: "m"` in `src/system.json`), matching the metric-flavored ranges
used elsewhere in the compendium (e.g. Radar Detector: 100m), so `18` here
approximates a 60ft real-world range under that default. A scene using a
feet-based grid instead would see a literal 18ft range from the same value.

This is V14+ only. On older clients (down to this system's
`compatibility.minimum: 13`) a `token.*` key silently does nothing — the same
no-op behavior these effects already had without ATL installed, so there's no
regression on older Foundry versions.

---

## Adding a new effect key

1. **Add the key to `CPR.activeEffectKeys`** in `src/modules/system/config.js` under the appropriate category:

   ```js
   // config.js
   CPR.activeEffectKeys.combat["bonuses.newKey"] = "CPR.effectSheet.combat.stats.newKey";
   ```

2. **Add the localization string** to `src/lang/en.json` (and other language files if maintained):

   ```json
   "CPR.effectSheet.combat.stats.newKey": "New Key Display Name"
   ```

3. **Handle the key in `CPRMod.getSituationalRollMods()`** if the key should appear in any roll dialog. Add it to the appropriate `attackRollBonusKeys`, `damageMods`, or similar filter array.

4. **Use the key** in the roll formula or application logic by reading `CPRMod.getRelevantMods(allMods, "newKey")` in the relevant roll class.

5. **Write a migration script** if you need to retroactively set this key on existing effects in existing worlds. See [Adding a migration script](./CONTRIBUTING.md#adding-a-migration-script).

---

## Troubleshooting

**Effects are not applying to rolls**

- Check that the item is in the correct usage state (equipped, installed, etc.) — suppressed effects silently do nothing.
- Confirm the effect is not `disabled` (`this.disabled`).
- Verify the key matches exactly (case-sensitive, including the `bonuses.` prefix).
- Check that `change.type` is a valid string, not a legacy numeric `mode`.

**`LOGGER` calls inside `CPRActiveEffect` methods don't output**

Known limitation: `LOGGER` does not work inside `CPRActiveEffect` getters (including `usage`). Use `console.log` / `console.warn` for debugging inside that class.

**Roll dialog shows no situational mods for a custom key**

`getSituationalRollMods()` only returns mods whose keys are explicitly listed for each roll type. If you add a new `bonuses.*` key, add it to the appropriate branch in `getSituationalRollMods()`.

**V14 warning about `CONST.ACTIVE_EFFECT_MODES`**

Remove any reference to `CONST.ACTIVE_EFFECT_MODES` and use string change types directly. Run migration script 044 to update stored world data.
