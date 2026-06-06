#!/usr/bin/env bash
# Install a portable Docker CLI + Compose plugin for Cursor Cloud agent pods.
# The Docker daemon runs on the host at DOCKER_HOST (default tcp://127.0.0.1:2375).
set -euo pipefail

CLI_ROOT="${CPR_DOCKER_CLI_DIR:-${HOME}/.local/share/cpr-docker-cli}"
BIN_DIR="${CLI_ROOT}/bin"
COMPOSE_VERSION="${DOCKER_COMPOSE_VERSION:-2.40.3}"
DOCKER_HOST_DEFAULT="tcp://127.0.0.1:2375"
FALLBACK_DOCKER_VERSION="${DOCKER_CLI_VERSION:-29.1.4}"

cli_log() {
  printf '[ensure-docker-cli] %s\n' "$*"
}

ensure_docker_host() {
  if [[ ! -S /var/run/docker.sock ]] && [[ -z "${DOCKER_HOST:-}" ]]; then
    export DOCKER_HOST="${DOCKER_HOST_DEFAULT}"
  fi
}

docker_cli_ready() {
  command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1
}

detect_docker_version() {
  if [[ -n "${DOCKER_CLI_VERSION:-}" ]]; then
    printf '%s\n' "${DOCKER_CLI_VERSION}"
    return 0
  fi

  ensure_docker_host
  if command -v curl >/dev/null 2>&1; then
    local version
    version="$(
      curl -fsS --max-time 5 "${DOCKER_HOST}/version" 2>/dev/null \
        | sed -n 's/.*"Version":"\([^"]*\)".*/\1/p' \
        | head -1
    )"
    if [[ -n "${version}" ]]; then
      printf '%s\n' "${version}"
      return 0
    fi
  fi

  printf '%s\n' "${FALLBACK_DOCKER_VERSION}"
}

install_docker_cli() {
  local version="$1"
  local archive="/tmp/docker-cli-${version}.tgz"
  mkdir -p "${BIN_DIR}"
  curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${version}.tgz" -o "${archive}"
  tar -xzf "${archive}" -C "${BIN_DIR}" --strip-components=1 docker/docker
  rm -f "${archive}"
  chmod +x "${BIN_DIR}/docker"
}

install_compose_plugin() {
  local plugin_dir="${DOCKER_CONFIG:-${HOME}/.docker}/cli-plugins"
  mkdir -p "${plugin_dir}"
  curl -fsSL \
    "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
    -o "${plugin_dir}/docker-compose"
  chmod +x "${plugin_dir}/docker-compose"
}

export_docker_path() {
  if [[ ":${PATH}:" != *":${BIN_DIR}:"* ]]; then
    export PATH="${BIN_DIR}:${PATH}"
  fi
}

main() {
  ensure_docker_host
  export_docker_path

  if docker_cli_ready; then
    cli_log "docker and compose already available"
    return 0
  fi

  local version
  version="$(detect_docker_version)"
  cli_log "Installing Docker CLI ${version} to ${BIN_DIR}"
  install_docker_cli "${version}"
  export_docker_path

  if ! docker compose version >/dev/null 2>&1; then
    cli_log "Installing Docker Compose plugin v${COMPOSE_VERSION}"
    install_compose_plugin
  fi

  if ! docker_cli_ready; then
    echo "Failed to install Docker CLI and Compose plugin." >&2
    return 1
  fi

  cli_log "Docker CLI ready (DOCKER_HOST=${DOCKER_HOST})"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
