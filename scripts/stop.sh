#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${FORGEDESK_RUNTIME_DIR:-$HOME/.forgedesk/runtime}"
BACKEND_PID_FILE="$RUNTIME_DIR/backend.pid"
WEB_PID_FILE="$RUNTIME_DIR/web.pid"

pid_is_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

stop_service() {
  local pid_file="$1"
  local service_name="$2"
  local pid=""

  if [[ -f "$pid_file" ]]; then
    pid="$(cat "$pid_file")"
  fi

  if [[ -z "$pid" ]]; then
    echo "$service_name is not running."
    rm -f "$pid_file"
    return
  fi

  if pid_is_running "$pid"; then
    echo "Stopping $service_name (PID $pid)"
    kill "$pid" >/dev/null 2>&1 || true

    for _ in {1..20}; do
      if ! pid_is_running "$pid"; then
        break
      fi
      sleep 0.5
    done

    if pid_is_running "$pid"; then
      echo "Force stopping $service_name (PID $pid)"
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  else
    echo "$service_name was not running."
  fi

  rm -f "$pid_file"
}

stop_service "$BACKEND_PID_FILE" "Backend"
stop_service "$WEB_PID_FILE" "Web app"

echo "ForgeDesk services stopped."
