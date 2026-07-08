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
| `test-workflow-permissions.sh` | Every `.github/workflows/*.yml` declares an explicit top-level `permissions:` block (#106) |
| `test-active-effect-legacy-mode.sh` | No compendium pack YAML uses the legacy numeric ActiveEffect `mode:` field instead of a string `type:` |
| `test-chat-roll-data.mjs` | Chat message `author`/speaker/whisper shape for roll cards |
| `test-dice-roll-mode.mjs` | Dice So Nice whisper mapping for roll modes |
| `test-chat-message-user.mjs` | ChatMessage `#user` fallback for legacy modules |
| `test-get-event-datum.mjs` | `GetEventDatum` ancestor lookup for `data-*` attrs |
| `test-actor-create-return-value.mjs` | `CPRBlackIceActor`/`CPRDemonActor`/`CPRContainerActor.create()` returning the created actor (#95) |
| `test-black-ice-program-sync.mjs` | Black ICE ↔ Program sync hook only firing on `rez` changes and null-checking the linked program (#95) |
| `test-delete-folder-veto.mjs` | Folder deletion combining every item's `preDeleteItem` veto, not just the last one (#95) |
| `test-combat-initiative.mjs` | `CPRCombat._getInitiativeFormula()` falsy-zero bug and batch initiative rolls skipping (not aborting on) an unowned combatant (#95) |
| `test-emp-luck-warning.mjs` | EMP/Luck triple-digit warning checking both stats independently (#95) |
| `test-item-update-dvtable-normalization.mjs` | `dvTable` null-to-empty-string remap covering weapon/cyberware/itemUpgrade (#95) |
| `test-container-actor-embedded-doc-guard.mjs` | `CPRContainerActor#createEmbeddedDocuments` fast path for non-Item embedded documents (#95) |

Extended handlebars jobs (gitlab-ci-local / `make lint`) cover helpers, tooltips, attributes, and more.

## Foundry E2E smoke test (required for sheet / template / dialog changes)

1. `./scripts/ensure-docker-cli.sh` (automatic when using `foundry-docker.sh` or `cloud-update.sh`)
2. `./scripts/foundry-docker.sh up`
3. `npm run build && ./scripts/foundry-docker.sh sync-system`
4. Open `http://127.0.0.1:30000`, load a **Cyberpunk RED - CORE** world with **lib-wrapper** enabled.
5. Verify:

- [ ] Character sheet opens (all tabs: Skills, Gear, Cyberware, Effects, Role, Fight, Lifepath)
- [ ] Mook and container sheets open
- [ ] Item sheet opens
- [ ] Skill check produces a chat card with modifier total
- [ ] No errors in the browser console on sheet render

6. After template edits, re-run `npm run test:regression` before opening a PR.

Cursor Cloud agents can run the full update path with `./scripts/cloud-update.sh` (requires `FOUNDRY_USERNAME` / `FOUNDRY_PASSWORD` secrets).

## When to add a new regression script

Add a focused script under `.github/workflows/pipeline_tests/` when:

- A bug escaped unit-less template/JS checks (e.g. Handlebars parse errors at runtime).
- The failure mode can be detected with a fast shell or Node check without Foundry.

Wire new scripts into `npm run test:regression` in `package.json`.
