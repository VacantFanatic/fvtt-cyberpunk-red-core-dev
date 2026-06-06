# Regression testing

Manual and automated checks to run before UX or sheet-template changes ship.

## Automated (CI)

The primary GitHub Actions workflow runs `npm ci`, version sync, `npm run lint`, and `npm run build`.

Additional regression scripts live under `.github/workflows/pipeline_tests/`. Run locally:

```bash
npm run test:regression
```

This currently includes:

| Script | What it catches |
| --- | --- |
| `test-handlebars-subexpression-syntax.sh` | Invalid Handlebars like `(helper arg).length` inside `{{...}}` |
| `test-handlebars-tags.sh` | Unbalanced HTML tags in `.hbs` templates |
| `test-handlebars-compare.sh` | `cprCompare` used for boolean tests |

Extended handlebars jobs (gitlab-ci-local / `make lint`) cover helpers, tooltips, attributes, and more.

## Foundry E2E smoke test (required for sheet / template / dialog changes)

1. `./scripts/foundry-docker.sh up`
2. `npm run build && ./scripts/foundry-docker.sh sync-system`
3. Open `http://127.0.0.1:30000`, load a **Cyberpunk RED - CORE** world with **lib-wrapper** enabled.
4. Verify:

- [ ] Character sheet opens (all tabs: Skills, Gear, Cyberware, Effects, Role, Fight, Lifepath)
- [ ] Mook and container sheets open
- [ ] Item sheet opens
- [ ] Skill check produces a chat card with modifier total
- [ ] No errors in the browser console on sheet render

5. After template edits, re-run `npm run test:regression` before opening a PR.

## When to add a new regression script

Add a focused script under `.github/workflows/pipeline_tests/` when:

- A bug escaped unit-less template/JS checks (e.g. Handlebars parse errors at runtime).
- The failure mode can be detected with a fast shell or Node check without Foundry.

Wire new scripts into `npm run test:regression` in `package.json`.
