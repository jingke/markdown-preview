#!/usr/bin/env bash
# Clear persisted Markdown documents: SQLite DB + blob files.
# Default (--container): removes /data/documents.sqlite3 and /data/files in the
# Compose backend volume (DOCUMENT_STORE_ROOT=/data in docker-compose.yml).
set -euo pipefail
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${_SCRIPT_DIR}/.."
# shellcheck source=scripts/podman-env.sh
source "${_SCRIPT_DIR}/podman-env.sh"

COMPOSE=(podman-compose -f docker-compose.yml)

clear_container_data() {
  local cmd
  cmd='rm -f /data/documents.sqlite3 && rm -rf /data/files && mkdir -p /data/files'
  set +e
  "${COMPOSE[@]}" exec -T backend sh -c "${cmd}"
  local exit_code
  exit_code=$?
  set -e
  if [ "${exit_code}" -eq 0 ]; then
    echo "Cleared /data in the running backend container."
    return 0
  fi
  "${COMPOSE[@]}" run --rm --no-deps backend sh -c "${cmd}"
  echo "Cleared /data using a one-shot backend container (same named volume)."
}

clear_local_data() {
  local root
  root="${DOCUMENT_STORE_ROOT:-$(pwd)/backend/data}"
  mkdir -p "${root}"
  rm -f "${root}/documents.sqlite3"
  rm -rf "${root}/files"
  mkdir -p "${root}/files"
  echo "Cleared document store at ${root}"
}

usage() {
  echo "Usage: $0 [--container | --local]"
  echo "  --container  Clear /data in the Compose backend volume (default)."
  echo "  --local      Clear DOCUMENT_STORE_ROOT, or repo backend/data on the host."
}

case "${1:---container}" in
  --container)
    clear_container_data
    ;;
  --local)
    clear_local_data
    ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    echo "Unknown option: $1" >&2
    usage >&2
    exit 1
    ;;
esac
