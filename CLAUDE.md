# Development notes

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
