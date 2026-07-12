# Development notes

## Live Foundry test instance

A live Foundry VTT world for manual/browser-driven verification is reachable
at `http://169.254.83.107:30000/` — log in as user `Cursor`, no password.
**Note:** this is a link-local address (`169.254.0.0/16`), only reachable
from a machine on the same local network as the host — confirmed
unreachable (connection timeout) from this project's remote/cloud Claude
Code sessions. Useful for local dev sessions running on that same network;
for remote sessions, either ask the user for a publicly reachable
tunnel/URL, or rely on their manual testing + reported console output.
When it is reachable, connect via Playwright (pre-installed Chromium) to
reproduce the exact reported symptom, inspect the live DOM/console, and
confirm a fix actually resolves it before reporting success.

## Before staging/committing any JS changes

Run a local formatting/lint check before staging changes — CI enforces Prettier
formatting via ESLint's `prettier/prettier` rule, and it has repeatedly caught
multi-line expressions (e.g. `.map()` chains, wrapped function calls) that
aren't formatted exactly the way Prettier expects.

```bash
node -p "require('./node_modules/prettier/package.json').version"  # sanity check first, see below
npm run prettier:fix   # auto-fixes formatting
npm run lint            # confirms eslint (incl. prettier/prettier) is clean
```

**Verify `node_modules` actually has the pinned Prettier version before trusting
`prettier:fix`.** If `node_modules/prettier` is missing or stale, `npx prettier`
silently falls back to whatever `prettier` is on `$PATH` (e.g. a newer global
install). Prettier's default formatting changed across major versions (v3
adds trailing commas everywhere that v2 doesn't), so running `prettier:fix`
with the wrong major version reformats large swaths of the codebase that
were already correctly formatted for CI — which actually happened once. If
the version check above doesn't match the `prettier` devDependency in
`package.json` (or errors because the module isn't installed), run `npm ci`
first, then re-check before running `prettier:fix`.

Do this before every commit that touches `src/modules/**/*.js`, `gulpfile.mjs`,
or `gulp/*.mjs` — not just before opening a PR — to avoid burning a CI cycle on
formatting-only failures.

## Security patterns caught by CodeQL (see #106)

Three code-scanning alerts were fixed in #106. `npm run lint` and
`npm run test:regression` now catch regressions of the same shape
automatically, but keep these in mind when writing similar code:

- **Every GitHub Actions workflow needs an explicit top-level `permissions:`
  block.** Without one, the workflow's `GITHUB_TOKEN` gets the broad implicit
  default permissions (`actions/missing-workflow-permissions`). Enforced by
  `.github/workflows/pipeline_tests/test-workflow-permissions.sh`, wired into
  `npm run test:regression`.
- **Don't use `String#replace(str, ...)` with a plain string when you mean
  "replace every occurrence"** — it only replaces the first match
  (`js/incomplete-sanitization`). Use `.replaceAll()`, or a `RegExp` with the
  `/g` flag. An ESLint `no-restricted-syntax` rule now errors on
  `.replace("...\n...", ...)`-shaped calls.
- **Don't wrap text pulled from a DOM node's `.text()` in
  `Handlebars.SafeString`.** `.text()`-derived strings can still contain
  HTML-decoded markup, and `SafeString` tells Handlebars to insert it
  unescaped wherever it's rendered — reintroducing the very markup the
  extraction was supposed to strip (`js/xss-through-dom`). Return the plain
  string and let Handlebars escape it. An ESLint rule now errors on
  `new Handlebars.SafeString(...)` wrapping a `.text()` call.

## ActiveEffect `changes[]` must use `type`, never legacy `mode`

Foundry V13 used a numeric `change.mode` (`CONST.ACTIVE_EFFECT_MODES`,
0-5); Foundry V14 replaced it with a string `change.type` and dropped the
old constant entirely. See `docs/ACTIVE-EFFECTS.md` for the full migration
story.

**This matters most for compendium pack YAML** (`src/packs/**`). Around 90
shipped `effect.*.yaml` / embedded-item `changes[]` entries were still using
the bare legacy `mode: N` shape with no `type` — the pack build pipeline
(`gulp/packs.mjs`) does not migrate data, it packs the YAML verbatim, so
these shipped straight into every install. For `bonuses.*` keys this was
merely latent (CPRMod's `normalizeChangeType()` provides a legacy-mode
fallback), but **`system.*` keys (e.g. `system.stats.int.value`) are applied
directly by Foundry core and bypass CPRMod entirely** — a type-less `mode`
there made stat increments behave like string concatenation instead of
numeric addition (e.g. a drug bumping a stat from 6 landed on 16 instead of
7).

- When adding/editing any compendium item or effect with `changes[]`, always
  write `type: "add"` (or `"override"`, `"multiply"`, etc.) — never `mode`.
- `.github/workflows/pipeline_tests/test-active-effect-legacy-mode.sh`
  (wired into `npm run test:regression`) fails if any pack YAML reintroduces
  a bare `mode:` field.
- If you need to fix already-existing world data, add a new migration
  script following `docs/CONTRIBUTING.md`'s "Adding a migration script"
  steps rather than relying on the pack fix alone — migrations only touch
  documents already in a world at the time they run, not future compendium
  drags from a not-yet-fixed pack.

## Never use an Array as a string-keyed data bag (e.g. `enrichedHTML`)

Sheet `_prepareContext()`/`getData()` methods build a per-render `enrichedHTML`
object holding `TextEditor.enrichHTML()` output, keyed by field name (e.g.
`enrichedHTML.systemLifepathCulturalOrigin`). `cpr-actor-sheet.js` once
initialized this as `cprData.enrichedHTML = [];` (an Array) and then bolted ~18
string-keyed properties onto it without ever using indices, so `.length`
stayed `0` the whole time. Every other sheet class in the codebase does this
correctly with a plain object (`cpr-demon-sheet.js`, `cpr-black-ice-sheet.js`:
`sheetData.enrichedHTML = sheetData.enrichedHTML ?? {};`).

This class of bug is easy to miss because the container still looks fine at
the point it's built — the failure shows up later, wherever the context
object gets cloned or merged (e.g. `foundry.utils.mergeObject`, `structuredClone`,
`JSON.stringify`, lodash `cloneDeep`, spread-based deep copies). All of these
treat arrays specially and only iterate actual indexed elements, silently
dropping any non-index string-keyed properties — so an Array used as an
object bag can pass through several object spreads untouched and then lose
every key at the one point something actually deep-clones it. The symptom is
confusing: persisted data is correct, the live document's prepared data model
is correct, but the template only ever sees `undefined` for those fields.

- Always initialize field-keyed template context containers (`enrichedHTML`,
  or anything similar) as `{}`, never `[]` — even though plain property
  access (`obj.foo = ...`) works identically on both at the point of
  assignment.
- If a value that should be a rendered/enriched field is coming back
  `undefined` in a template despite the underlying document data being
  verifiably correct (check via `actor.toObject()` for persisted source and
  `actor.system.x` for the live prepared model), suspect the context-building
  object itself before suspecting persistence, hooks, or re-render timing.

## Cutting an RC build to verify a PR before merging

The GitHub MCP tools available to Claude Code sessions here have **no
release-creation or asset-upload capability** (only `list_releases`/
`get_latest_release`/`get_release_by_tag` — read-only), and raw GitHub REST
API access (`gh` CLI, curl) is out of bounds. A manual release is not
achievable directly. Instead, use the repo's existing automated pipeline:

- `.github/workflows/release-main.yml` triggers via `workflow_run` after the
  `CI` workflow completes on `main`, `master`, or **`dev`**. If
  `package.json`'s version contains a `-` (e.g. `1.4.29-rc.1`), it's treated
  as a prerelease: it publishes a normal draft `vX.Y.Z-rc.N` release *and*
  overwrites a moving `prerelease` tag/release that always points at the
  latest RC — that alias is published immediately (not draft), so its
  `browser_download_url` is usable right away without anyone needing to
  click "publish" on GitHub.
- To cut an RC for a PR: check out `dev`, reset it to current `main` (`dev`
  tends to go stale between uses — it's only touched for this purpose, e.g.
  it sat 3 versions behind `main` after PR #108's verification), merge in
  the PR branch, bump the version in **both** `package.json` and
  `src/system.json` to `<next-version>-rc.N` (the release job fails if
  these two don't match), commit (`chore(release): cut X.Y.Z-rc.N from dev
  to verify #<PR> before merging`), and push. This overwrites `dev`'s
  history (force-push) and temporarily repoints the shared `prerelease`
  alias — get explicit user permission first, same as any push to a branch
  other than the one a task is scoped to.
- **The Actions API's top-level `head_sha`/`head_branch` fields on a
  `workflow_run`-triggered run do NOT necessarily reflect what was actually
  checked out and built** — they can show a stale/unrelated commit (e.g. an
  old `main` tip) even though the job internally used
  `github.event.workflow_run.head_sha` correctly. Don't conclude the
  pipeline didn't fire just because `list_workflow_runs` shows the "wrong"
  commit. Verify what actually got built by checking whether the
  prerelease-only steps ran (`Rewrite manifest...`/`Publish static
  "prerelease" alias release` — these are skipped entirely for non-`-`
  versions) and by reading the actual release body/assets via
  `get_release_by_tag` for tag `prerelease`, which states the exact commit
  and version it was built from.
- Full `dist/` builds are large (~60MB+, dominated by static assets:
  tiles/icons/images/packs/maps/fonts unrelated to most code changes) — well
  over the ~30MB direct file-send limit for delivering files straight to a
  user. For a full standalone build, use this RC pipeline. For a quick
  local-overlay test on an existing install, a code-only zip (`modules/`,
  `css/`, `lang/`, `templates/`, `system.json`, `cpr.js`, `environment.js`,
  `template.json` — well under 1MB) sent directly is usually sufficient
  since assets/packs rarely change alongside a typical code fix.

## The "does it hit" hit-check feature already exists — don't rebuild it

`src/modules/additions/does-it-hit.js` (ported from the community "diwako"
Foundry module) is the system's only codified hit/miss determination. It's
a `createChatMessage` hook that, for the attacking client only
(`isChatMessageAuthor` guard) and only when a token is targeted and the
attacking weapon has a `dvTable` configured, compares the attack roll total
against a computed DV and posts a narrative hit/miss chat message.
Cyberpunk RED's core rules otherwise leave "did it hit" as a GM/player
verbal judgment call — nothing else in the roll pipeline (`CPRAttackRoll`,
`CPRChat`, chat message data) tracks a target DV or a hit/miss result.
`DV` elsewhere in the codebase (the ranged weapon glyph, the token HUD
display) is a GM-facing range-measuring aid only, never compared to a roll
total.

If a feature needs a hit/miss signal, hook into `does-it-hit.js`'s
locally-computed `success` boolean (e.g. by calling out to other code from
inside that hook, as done for auto-triggering damage rolls on a hit) rather
than inventing parallel DV-comparison logic. Note this hook only fires for
weapon attack cards, not cyberdeck/program attack cards — the two card
templates' `data-tooltip` differ (weapon cards run the string through
`{{localize ...}}`, the program-attack card doesn't), and the hook's
`isAttack` selector matches only the localized form.

## Frameless/`positioned: false` `ApplicationV2` windows need their own z-index

Foundry's normal `ApplicationV2` bring-to-front-on-render/focus behavior is
implemented as part of its position-management pipeline
(`setPosition`/`_updatePosition`). Setting `window: { positioned: false }`
(e.g. to build a CSS-anchored floating panel instead of a draggable
Foundry-positioned window) skips that whole pipeline — the window never
gets Foundry's automatic z-index bump, and is permanently pinned at
whatever static value the CSS declares.

`--z-index-canvas` is **not** a safe baseline for such a panel: it's the
PIXI game-canvas/board layer's z-index, which sits *below* Foundry's
`#interface` layer (sidebar, hotbar, all normal `ApplicationV2` windows).
It's fine for `position: relative` elements that only need to beat local
siblings inside a container (see `src/css/layout/progress-bar.css`), but a
`position: fixed` panel meant to float above the whole UI needs a
high static z-index set explicitly (both in CSS as a fallback and via
`el.style.zIndex` in JS, re-asserted on `pointerdown` since the panel won't
otherwise get bumped when the user later opens another window) — see
`src/modules/dialog/cpr-roll-slide-panel.js`. Similarly, don't assume
Foundry exposes CSS custom properties like `--sidebar-width`/
`--hotbar-height` without confirming them against a live client first —
if unconfirmed, measure the real DOM elements (`#sidebar`/`#hotbar`) in JS
instead of guessing static fallback values.

## Foundry has no native settings section headers — use `renderSettingsConfig`

Foundry v13/v14's Settings Config only groups registered settings by
package/namespace; everything under `game.system.id` renders as one flat
list, in registration order, with no built-in way to insert visual
dividers between logically related settings (there's an open, unshipped
upstream proposal — `foundryvtt/foundryvtt#13541` — but nothing shipped).
When registration order alone isn't enough to keep two related-but-distinct
settings from reading as if one controls the other (e.g.
`useSlidingAttackPanel`, a pure UI-style toggle, sitting ~30 entries away
from `additionsAutoRollDamageOnHit`, an automation toggle it's easily
mistaken for), add a `Hooks.on("renderSettingsConfig", ...)` handler that
inserts header elements into the rendered form — see
`src/modules/system/settings-headers.js`. Foundry renders each setting's
input with `name="<namespace>.<key>"` (and each registered menu button with
`data-key="<namespace>.<key>"`), both wrapped in a `.form-group`; select on
that to find where to insert a divider before a given setting. Since this
repo can't verify the exact ApplicationV2 Settings Config DOM structure
against live Foundry source, wrap the whole thing in a try/catch that logs
via `LOGGER.error` and no-ops on a selector mismatch, so a future Foundry
DOM change degrades to "no headers shown" rather than breaking the settings
menu.

## Sequencing a Promise-resolving dialog's close animation

`CPRDialog#confirmDialog()`/`closeDialog()`
(`src/modules/dialog/cpr-dialog-application.js`) resolve/reject the Promise
from `showDialog()` and then call `this.close(options)`. If a subclass's
`close()` is `async` and awaits a CSS transition (e.g.
`CPRRollSlidePanel`'s slide-out animation), resolving *before* awaiting
`close()` lets whatever's awaiting `showDialog()` proceed while the dialog
is still visually closing — e.g. an auto-triggered follow-up dialog (the
damage panel opening after an auto-detected attack hit) could visually
overlap the one that triggered it. Fixed by awaiting `this.close(options)`
before firing the resolve/reject callback. This is a no-op timing-wise for
every dialog whose `close()` has no animation to await (the base
`ApplicationV2` case) and for `prefers-reduced-motion` (where
`CPRRollSlidePanel.close()` skips the animation entirely) — the tradeoff
(a ~200-250ms delay between clicking Confirm and the roll actually
happening) only applies on the animated slide-panel path.
