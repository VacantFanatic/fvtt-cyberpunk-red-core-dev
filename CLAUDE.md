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
