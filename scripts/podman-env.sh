#!/usr/bin/env bash
# Session D-Bus for rootless Podman networking (slirp4netns → systemd user.slice).
# Without it, Podman can fail with:
#   dial unix /run/user/1000/bus: connect: no such file or directory
# Common when: WSL without full user session, SSH without pam_systemd, cron, CI.

podman_prepare_session_dbus() {
  local uid
  uid="$(id -u)"
  local runtime
  runtime="${XDG_RUNTIME_DIR:-}"
  if [ -z "$runtime" ]; then
    runtime="/run/user/${uid}"
  fi
  export XDG_RUNTIME_DIR="${runtime}"

  local bus
  bus="${runtime}/bus"

  if [ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
    local path_part
    path_part="${DBUS_SESSION_BUS_ADDRESS#unix:path=}"
    if [ -n "$path_part" ] && [ ! -S "$path_part" ]; then
      unset DBUS_SESSION_BUS_ADDRESS
    fi
  fi

  if [ -S "$bus" ]; then
    export DBUS_SESSION_BUS_ADDRESS="unix:path=${bus}"
    return 0
  fi

  if command -v dbus-launch >/dev/null 2>&1; then
    eval "$(dbus-launch --sh-syntax)"
    return 0
  fi

  return 0
}

podman_prepare_session_dbus
