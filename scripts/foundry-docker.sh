#!/usr/bin/env bash
# Start/stop/status for the Foundry VTT Docker dev server used in Cursor Cloud.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker/foundry-compose.yml"
SYSTEM_DEST="/data/Data/systems/cyberpunk-red-core"
CONTAINER_NAME="cpr-foundry-dev"

# Cloud VM Docker daemon is exposed on TCP, not a local socket.
if [[ ! -S /var/run/docker.sock ]] && [[ -z "${DOCKER_HOST:-}" ]]; then
  export DOCKER_HOST=tcp://127.0.0.1:2375
fi

FOUNDRY_ENV_FILE="${FOUNDRY_ENV_FILE:-${HOME}/foundry-docker.env}"
WORKSPACE_ENV_FILE="${ROOT_DIR}/foundry-docker.env"
DIST_DIR="${ROOT_DIR}/dist"

log() {
  printf '[foundry-docker] %s\n' "$*"
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker CLI not found. Install docker-ce-cli and docker-compose-plugin." >&2
    exit 1
  fi
}

container_running() {
  docker inspect -f '{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null | grep -q true
}

foundry_http_ok() {
  curl -fsS --max-time 5 http://127.0.0.1:30000 >/dev/null 2>&1
}

materialize_env_file() {
  # When Cursor secrets are injected, refresh the persisted file (overwrites manual edits).
  if [[ -n "${FOUNDRY_USERNAME:-}" && -n "${FOUNDRY_PASSWORD:-}" ]]; then
    umask 077
    {
      printf 'FOUNDRY_USERNAME=%q\n' "${FOUNDRY_USERNAME}"
      printf 'FOUNDRY_PASSWORD=%q\n' "${FOUNDRY_PASSWORD}"
    } >"${FOUNDRY_ENV_FILE}"
    log "Wrote ${FOUNDRY_ENV_FILE} from environment secrets"
    return 0
  fi

  if [[ -f "${FOUNDRY_ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    set -a && source "${FOUNDRY_ENV_FILE}" && set +a
    if [[ -n "${FOUNDRY_USERNAME:-}" && -n "${FOUNDRY_PASSWORD:-}" ]]; then
      return 0
    fi
  fi

  if [[ -f "${WORKSPACE_ENV_FILE}" ]]; then
    install -m 600 "${WORKSPACE_ENV_FILE}" "${FOUNDRY_ENV_FILE}"
    set -a && source "${FOUNDRY_ENV_FILE}" && set +a
    log "Loaded ${FOUNDRY_ENV_FILE} from workspace copy"
    return 0
  fi

  echo "Foundry credentials missing." >&2
  echo "  Set Cursor secrets FOUNDRY_USERNAME + FOUNDRY_PASSWORD, or" >&2
  echo "  copy foundry-docker.env.example to ~/foundry-docker.env" >&2
  return 1
}

sync_foundryconfig() {
  local config="${ROOT_DIR}/foundryconfig.json"
  # Gulp builds to dist/ when foundryconfig.json is absent; sync-system deploys dist/ into Foundry.
  rm -f "${config}"
  log "Using dist/ for Gulp output (deploy with sync-system)"
}

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

wait_for_http() {
  local attempts="${1:-60}"
  for ((i = 1; i <= attempts; i++)); do
    if foundry_http_ok; then
      log "Foundry HTTP OK at http://127.0.0.1:30000 (${i} attempts)"
      return 0
    fi
    sleep 10
  done
  return 1
}

cmd_sync_system() {
  require_docker
  if ! container_running; then
    log "Container ${CONTAINER_NAME} is not running — run: ./scripts/foundry-docker.sh up"
    return 1
  fi
  if [[ ! -f "${DIST_DIR}/system.json" ]]; then
    log "dist/ missing — run npm run build first"
    return 1
  fi
  docker exec "${CONTAINER_NAME}" mkdir -p "${SYSTEM_DEST}" 2>/dev/null || true
  docker cp "${DIST_DIR}/." "${CONTAINER_NAME}:${SYSTEM_DEST}/"
  log "Synced dist/ -> container:${SYSTEM_DEST}"
}

cmd_up() {
  require_docker
  materialize_env_file
  export FOUNDRY_USERNAME FOUNDRY_PASSWORD
  sync_foundryconfig

  if container_running && foundry_http_ok; then
    log "Foundry already running at http://127.0.0.1:30000"
    cmd_status
    return 0
  fi

  log "Starting Foundry (Docker volume: docker_cpr-foundry-data)"
  local -a up_args=(-d --remove-orphans)
  if [[ "${FOUNDRY_RECREATE:-}" == "1" ]]; then
    up_args+=(--force-recreate)
    log "FOUNDRY_RECREATE=1 — recreating container"
  fi
  compose up "${up_args[@]}"

  if wait_for_http 90; then
    cmd_status
  else
    log "Foundry not responding yet — check: ./scripts/foundry-docker.sh logs"
    compose ps || true
    return 1
  fi
}

cmd_down() {
  require_docker
  compose down
}

cmd_status() {
  require_docker
  if compose ps 2>/dev/null | grep -q "${CONTAINER_NAME}"; then
    compose ps
    if foundry_http_ok; then
      log "Foundry HTTP OK at http://127.0.0.1:30000"
    else
      log "Container running; Foundry may still be downloading or starting"
    fi
  else
    log "Foundry container is not running"
    return 1
  fi
}

cmd_logs() {
  require_docker
  compose logs -f --tail=100
}

usage() {
  cat <<EOF
Usage: $(basename "$0") {up|down|status|logs|sync-system}

  up           Start Foundry (idempotent). Uses Docker named volume for user data.
  down         Stop Foundry container (volume retained).
  status       Show container state and probe port 30000.
  logs         Follow Foundry container logs.
  sync-system  Copy dist/ into the running container's CPR system folder.

Build workflow:
  npm run build && ./scripts/foundry-docker.sh sync-system

Environment:
  FOUNDRY_RECREATE=1   Force container recreate (e.g. after compose file changes)

Persistence:
  Worlds/modules/config -> Docker volume docker_cpr-foundry-data (on Docker host)
  Credentials           -> ${FOUNDRY_ENV_FILE}
  System source           -> git repo; deploy via dist/ + sync-system
EOF
}

main() {
  local cmd="${1:-up}"
  case "${cmd}" in
    up) cmd_up ;;
    down) cmd_down ;;
    status) cmd_status ;;
    logs) cmd_logs ;;
    sync-system) cmd_sync_system ;;
    -h | --help | help) usage ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
