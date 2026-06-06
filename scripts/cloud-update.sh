#!/usr/bin/env bash
# Cursor Cloud VM update script — referenced from AGENTS.md.
# Installs npm deps, bootstraps the Docker CLI, and starts Foundry when credentials exist.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() {
  printf '[cloud-update] %s\n' "$*"
}

cd "${ROOT_DIR}"

log "Installing npm dependencies"
npm ci

log "Ensuring Docker CLI"
"${ROOT_DIR}/scripts/ensure-docker-cli.sh"

log "Starting Foundry (skipped if credentials are missing)"
if "${ROOT_DIR}/scripts/foundry-docker.sh" up; then
  log "Foundry ready at http://127.0.0.1:30000"
else
  status=$?
  if [[ "${status}" -eq 2 ]]; then
    log "Foundry credentials not configured — skipping startup"
    exit 0
  fi
  exit "${status}"
fi
