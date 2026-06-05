# AGENTS.md

Guidance for cloud agents and automated development environments working on **fvtt-cyberpunk-red-core** (Cyberpunk RED game system for Foundry VTT).

## Product overview

This repository is a **Foundry VTT game system**, not a standalone web application. The built output is a Foundry package (JavaScript, Handlebars templates, CSS, compendium packs) that Foundry loads from `Data/systems/cyberpunk-red-core`.

Runtime testing requires **Foundry VTT v13–14** and the **`lib-wrapper`** module. See `src/system.json` for compatibility details.

## Cursor Cloud specific instructions

### Automatic startup (update script)

The VM update script runs:

1. `npm ci`
2. `./scripts/foundry-docker.sh up` (starts Foundry if credentials exist; no-op with a log message if missing)

Do **not** add `npm run watch` or `npm run build` to the update script.

### Foundry VTT in Docker (persistent E2E)

Foundry runs in Docker via [felddy/foundryvtt-docker](https://github.com/felddy/foundryvtt-docker). Configuration lives **in this repo**; worlds and user data persist **outside the repo** so they survive agent sessions when the VM home directory is preserved.

| Path | Purpose |
|------|---------|
| `docker/foundry-compose.yml` | Compose service definition (Foundry 14.360) |
| `scripts/foundry-docker.sh` | `up` / `down` / `status` / `logs` |
| `~/foundry-data/` | Bind mount for Foundry `/data` (worlds, modules, config) |
| `~/foundry-docker.env` | Foundry account credentials (mode 600, **not** in git) |
| `foundryconfig.json` | Written by `foundry-docker.sh up`; points Gulp at `~/foundry-data` |

**Credentials (required once per VM):** add Cursor Cloud secrets **`FOUNDRY_USERNAME`** and **`FOUNDRY_PASSWORD`** (foundryvtt.com account used to download Foundry). On first `up`, the script writes `~/foundry-docker.env`. Alternatively copy `foundry-docker.env.example` to `~/foundry-docker.env` or `./foundry-docker.env` (gitignored).

**Docker CLI:** the cloud VM exposes Docker on `tcp://127.0.0.1:2375`. The script sets `DOCKER_HOST` automatically. If `docker` is missing, install `docker-ce-cli` and `docker-compose-plugin` (Ubuntu).

**Commands:**

```bash
./scripts/foundry-docker.sh up      # start Foundry, sync foundryconfig.json
./scripts/foundry-docker.sh status  # container + HTTP probe
./scripts/foundry-docker.sh logs    # follow startup / download logs
npm run watch                       # rebuild system into ~/foundry-data/Data/systems/...
```

**Browser:** open `http://127.0.0.1:30000` (Desktop pane / VNC). First launch runs Foundry setup; create a world with **Cyberpunk RED - CORE**. Install the **`lib-wrapper`** module (required in `system.json`).

**Why a previous session “lost” Foundry:** only `~/foundry-data` and `~/foundry-docker.env` persist user state. Ephemeral `/tmp/foundryvtt` was a Gulp-only stub, not a Foundry server. Without the committed compose/script (added in this repo), new agent sessions had nothing to restart.

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
| Foundry Docker | `./scripts/foundry-docker.sh up` |

GitHub Actions CI (`.github/workflows/ci.yml`) runs **`npm ci` → version sync check → `npm run lint` → `npm run build`**. That is the minimum bar for most code changes.

### Build output location

By default, Gulp writes to `dist/`. For in-client development with Docker Foundry:

1. Run `./scripts/foundry-docker.sh up` (creates `foundryconfig.json` with `dataPath: ~/foundry-data`).
2. Run `npm run build` or `npm run watch` — output goes to `~/foundry-data/Data/systems/cyberpunk-red-core`.

**Do not** point `dataPath` at this git repository or any directory containing a `.git` folder; Gulp will refuse to build there.

### Running Foundry locally (outside Docker)

If you prefer a native Foundry install:

1. Install Foundry VTT v13 or v14 locally.
2. Install the **`lib-wrapper`** module.
3. Copy `foundryconfig.json.example` to `foundryconfig.json` and set `dataPath` to your Foundry user-data root.
4. Run `npm run watch` and open a CPR world.

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

- **`foundryconfig.json` missing** — run `./scripts/foundry-docker.sh up` or copy `foundryconfig.json.example`; otherwise build goes to `dist/` with a Gulp warning.
- **`npm run watch`** — long-running; use tmux for background watch sessions.
- **Foundry credentials missing** — update script skips Foundry start; add `FOUNDRY_USERNAME` / `FOUNDRY_PASSWORD` secrets and re-run `./scripts/foundry-docker.sh up`.
- **Pack schema validation** (`test-packs.sh`) may report many errors on some branches; the primary GitHub Actions workflow does not gate on this job.
