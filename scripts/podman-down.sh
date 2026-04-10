#!/usr/bin/env bash
set -euo pipefail
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${_SCRIPT_DIR}/.."
# shellcheck source=scripts/podman-env.sh
source "${_SCRIPT_DIR}/podman-env.sh"
exec podman-compose -f docker-compose.yml down "$@"
