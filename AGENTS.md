# AGENTS.md

Guidance for cloud agents and automated development environments working on **fvtt-cyberpunk-red-core** (Cyberpunk RED game system for Foundry VTT).

## Product overview

This repository is a **Foundry VTT game system**, not a standalone web application. The built output is a Foundry package (JavaScript, Handlebars templates, CSS, compendium packs) that Foundry loads from `Data/systems/cyberpunk-red-core`.

Runtime testing requires **Foundry VTT v13–14** and the **`lib-wrapper`** module. See `src/system.json` for compatibility details.

## Cursor Cloud specific instructions

### Automatic startup (update script)

The VM update script runs `npm ci` only. Do not add build, watch, or Foundry startup to the update script.

### Core development commands

Standard commands are defined in `package.json` and `Makefile`:

| Task | Command |
|------|---------|
| Install deps | `npm ci` (or `make install` for a clean reinstall) |
| Build | `npm run build` or `make build` |
| Watch / live rebuild | `npm run watch` or `make watch` |
| ESLint | `npm run lint` |
| Stylelint | `npm run stylelint` |
| Prettier check | `npm run prettier` |

GitHub Actions CI (`.github/workflows/ci.yml`) runs **`npm ci` → version sync check → `npm run lint` → `npm run build`**. That is the minimum bar for most code changes.

### Build output location

By default, Gulp writes to `dist/`. To deploy directly into a local Foundry user-data folder during development:

1. Copy `foundryconfig.json.example` to `foundryconfig.json` (gitignored).
2. Set `dataPath` to your Foundry user-data root (the folder that contains `Data/`).
3. Run `npm run build` or `npm run watch` — output goes to `{dataPath}/Data/systems/cyberpunk-red-core`.

**Do not** point `dataPath` at this git repository or any directory containing a `.git` folder; Gulp will refuse to build there.

### Running in Foundry (manual E2E)

Foundry VTT is proprietary and is **not** installed in the cloud VM by default. For in-client testing:

1. Install Foundry VTT v13 or v14 locally.
2. Install the **`lib-wrapper`** module (required dependency in `system.json`).
3. Configure `foundryconfig.json` and run `npm run watch`.
4. In Foundry, create or open a world using the **Cyberpunk RED - CORE** system.

Optional modules (Babele, quick-insert, dice-so-nice, etc.) improve specific features but are not required for basic smoke testing.

### Extended CI (optional)

The legacy GitLab-style job definitions under `.github/workflows/ci/` can be run locally with **`gitlab-ci-local`** (not an npm dependency — install globally or via `npx` if needed):

- `make lint` — lint, formatting, and Handlebars checks (requires `gitlab-ci-local` in `node_modules` or on PATH).
- `make validate-packs` — JSON Schema validation of compendium YAML via `test-packs.sh`.
- `make ci` — full test stage.

Some jobs need extra system tools:

- **`jq`** — pack validation (usually preinstalled on the VM).
- **`yamllint`** — YAML lint job (`pip install yamllint` or system package).
- **`shellcheck`** / **`shfmt`** — shell script tests.

CI-only secrets (`CHOOM_BOT_API`, Discord tokens, etc.) are not required for local builds; `test-choombot-key.sh` skips the API check when `CI` is not `true`.

### Node version

CI uses **Node 20**. The repo requires Node **≥15**; Node 22 on the cloud VM works for build and lint.

### Gotchas

- **`foundryconfig.json` missing** — build still succeeds; output goes to `dist/` with a Gulp warning.
- **`npm run watch`** — long-running; use tmux for background watch sessions.
- **No automated browser/E2E tests** — validation is static (lint, schema, shell checks) plus manual Foundry testing.
- **Pack schema validation** (`test-packs.sh`) may report many errors on some branches; the primary GitHub Actions workflow does not gate on this job.
