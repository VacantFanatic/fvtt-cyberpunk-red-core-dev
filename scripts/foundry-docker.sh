#!/usr/bin/env bash
# Start/stop/status for the Foundry VTT Docker dev server used in Cursor Cloud.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker/foundry-compose.yml"

# Cloud VM Docker daemon is exposed on TCP, not a local socket.
if [[ ! -S /var/run/docker.sock ]] && [[ -z "${DOCKER_HOST:-}" ]]; then
  export DOCKER_HOST=tcp://127.0.0.1:2375
fi

FOUNDRY_DATA_DIR="${FOUNDRY_DATA_DIR:-${HOME}/foundry-data}"
FOUNDRY_ENV_FILE="${FOUNDRY_ENV_FILE:-${HOME}/foundry-docker.env}"
WORKSPACE_ENV_FILE="${ROOT_DIR}/foundry-docker.env"

log() {
  printf '[foundry-docker] %s\n' "$*"
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker CLI not found. Install docker-ce-cli and docker-compose-plugin." >&2
    exit 1
  fi
}

materialize_env_file() {
  if [[ -f "${FOUNDRY_ENV_FILE}" ]]; then
    return 0
  fi

  if [[ -f "${WORKSPACE_ENV_FILE}" ]]; then
    install -m 600 "${WORKSPACE_ENV_FILE}" "${FOUNDRY_ENV_FILE}"
    log "Copied ${WORKSPACE_ENV_FILE} -> ${FOUNDRY_ENV_FILE}"
    return 0
  fi

  if [[ -n "${FOUNDRY_USERNAME:-}" && -n "${FOUNDRY_PASSWORD:-}" ]]; then
    umask 077
    cat >"${FOUNDRY_ENV_FILE}" <<EOF
FOUNDRY_USERNAME=${FOUNDRY_USERNAME}
FOUNDRY_PASSWORD=${FOUNDRY_PASSWORD}
EOF
    log "Wrote ${FOUNDRY_ENV_FILE} from environment secrets"
    return 0
  fi

  echo "Foundry credentials missing." >&2
  echo "  Set Cursor secrets FOUNDRY_USERNAME + FOUNDRY_PASSWORD, or" >&2
  echo "  copy foundry-docker.env.example to ~/foundry-docker.env" >&2
  return 1
}

sync_foundryconfig() {
  local config="${ROOT_DIR}/foundryconfig.json"
  umask 022
  cat >"${config}" <<EOF
{
  "dataPath": "${FOUNDRY_DATA_DIR}"
}
EOF
  log "Wrote foundryconfig.json -> dataPath ${FOUNDRY_DATA_DIR}"
}

ensure_data_dir() {
  mkdir -p "${FOUNDRY_DATA_DIR}/container_cache"
}

compose() {
  FOUNDRY_DATA_DIR="${FOUNDRY_DATA_DIR}" \
    FOUNDRY_ENV_FILE="${FOUNDRY_ENV_FILE}" \
    docker compose -f "${COMPOSE_FILE}" "$@"
}

cmd_up() {
  require_docker
  materialize_env_file
  ensure_data_dir
  sync_foundryconfig
  log "Starting Foundry (data: ${FOUNDRY_DATA_DIR})"
  compose up -d --remove-orphans
  cmd_status
}

cmd_down() {
  require_docker
  if [[ ! -f "${FOUNDRY_ENV_FILE}" ]]; then
    log "No env file; nothing to stop"
    return 0
  fi
  compose down
}

cmd_status() {
  require_docker
  if compose ps 2>/dev/null | grep -q cpr-foundry-dev; then
    compose ps
    if curl -fsS --max-time 3 http://127.0.0.1:30000 >/dev/null 2>&1; then
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
Usage: $(basename "$0") {up|down|status|logs}

  up      Start Foundry (idempotent). Writes foundryconfig.json for Gulp watch/build.
  down    Stop Foundry container.
  status  Show container state and probe port 30000.
  logs    Follow Foundry container logs.

Persistent paths (survive cloud agent VM snapshots when home is preserved):
  Data:  ${FOUNDRY_DATA_DIR}
  Creds: ${FOUNDRY_ENV_FILE}
EOF
}

main() {
  local cmd="${1:-up}"
  case "${cmd}" in
    up) cmd_up ;;
    down) cmd_down ;;
    status) cmd_status ;;
    logs) cmd_logs ;;
    -h | --help | help) usage ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
