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

Foundry runs in Docker via [felddy/foundryvtt-docker](https://github.com/felddy/foundryvtt-docker). Configuration lives **in this repo**; Foundry worlds and modules persist in a **Docker named volume** on the host (not a bind mount from the agent pod — pod paths are invisible to the Docker host).

| Path | Purpose |
|------|---------|
| `docker/foundry-compose.yml` | Compose service (Foundry 14.x) |
| `scripts/foundry-docker.sh` | `up` / `down` / `status` / `logs` / `sync-system` |
| Docker volume `docker_cpr-foundry-data` | Worlds, modules, Foundry config (persists on Docker host) |
| `~/foundry-docker.env` | Credentials (`%q`-quoted bash source file, mode 600) |
| `foundryconfig.json` | Optional; omit for `dist/` builds (default). Use only for native Foundry user-data paths. |
| `dist/` → `sync-system` | Deploy built system into the container |

**Credentials:** Cursor Cloud secrets **`FOUNDRY_USERNAME`** and **`FOUNDRY_PASSWORD`**. The script exports them to Compose (avoids `$` corruption in env files) and writes `~/foundry-docker.env` for sessions without re-injected secrets.

**Commands:**

```bash
./scripts/foundry-docker.sh up           # start Foundry
npm run build && ./scripts/foundry-docker.sh sync-system
npm run watch                          # rebuild to dist/; re-run sync-system after changes
./scripts/foundry-docker.sh status     # container + HTTP probe
```

**Browser:** `http://127.0.0.1:30000`. Create a world with **Cyberpunk RED - CORE**; install **`lib-wrapper`**.

**Why bind-mounting `~/foundry-data` failed:** the agent pod and Docker host have separate filesystems. Only Docker named volumes or host paths that exist on the Docker host work for persistence.

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

1. Run `./scripts/foundry-docker.sh up` (creates `foundryconfig.json` targeting `dist/`).
2. Run `npm run build && ./scripts/foundry-docker.sh sync-system`.
3. Run `npm run watch` for live rebuilds to `dist/`; re-run `sync-system` to push into Foundry.

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
