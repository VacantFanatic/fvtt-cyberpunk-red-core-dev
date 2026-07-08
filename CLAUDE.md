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
