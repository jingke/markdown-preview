#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec podman-compose -f docker-compose.yml up --build "$@"
