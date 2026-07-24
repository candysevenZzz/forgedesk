#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${FORGEDESK_DEV_CONFIG:-$HOME/.forgedesk/dev.env}"
RUNTIME_DIR="${FORGEDESK_RUNTIME_DIR:-$HOME/.forgedesk/runtime}"
BACKEND_PID_FILE="$RUNTIME_DIR/backend.pid"
WEB_PID_FILE="$RUNTIME_DIR/web.pid"
BACKEND_LOG_FILE="$RUNTIME_DIR/backend.log"
WEB_LOG_FILE="$RUNTIME_DIR/web.log"
BACKEND_PORT=8080
WEB_PORT=1420
START_BACKEND="${FORGEDESK_START_BACKEND:-1}"
START_WEB=1

if [[ -f "$CONFIG_FILE" ]]; then
  # 本地开发偏好，不属于仓库配置。
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  START_BACKEND="${FORGEDESK_START_BACKEND:-$START_BACKEND}"
fi

case "${1:-}" in
  --with-backend) START_BACKEND=1 ;;
  --web-only) START_BACKEND=0 ;;
  --backend-only) START_WEB=0; START_BACKEND=1 ;;
  --help)
    cat <<'EOF'
用法：npm run start [-- --with-backend|--web-only|--backend-only]

本地配置：~/.forgedesk/dev.env
  FORGEDESK_START_BACKEND=0  # 前端启动时不拉起后端
EOF
    exit 0
    ;;
  *)
    echo "未知参数：$1" >&2
    exit 1
    ;;
esac

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

pid_is_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

read_pid() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    cat "$pid_file"
  fi
}

ensure_not_running() {
  local pid_file="$1"
  local service_name="$2"
  local pid

  pid="$(read_pid "$pid_file")"
  if [[ -n "${pid:-}" ]] && pid_is_running "$pid"; then
    echo "$service_name is already running with PID $pid." >&2
    exit 1
  fi

  rm -f "$pid_file"
}

require_command npm
require_command lsof
if [[ "$START_WEB" == "1" ]]; then
  require_command curl
fi
if [[ "$START_BACKEND" == "1" || "$START_BACKEND" == "true" ]]; then
  require_command bash
fi

mkdir -p "$RUNTIME_DIR"

if [[ "$START_BACKEND" == "1" || "$START_BACKEND" == "true" ]]; then
  ensure_not_running "$BACKEND_PID_FILE" "Backend"
fi
if [[ "$START_WEB" == "1" ]]; then
  ensure_not_running "$WEB_PID_FILE" "Web app"
fi

if [[ "$START_BACKEND" == "1" || "$START_BACKEND" == "true" ]] && port_in_use "$BACKEND_PORT"; then
  echo "Port $BACKEND_PORT is already in use. Stop the existing service first." >&2
  exit 1
fi

if [[ "$START_WEB" == "1" ]] && port_in_use "$WEB_PORT"; then
  echo "Port $WEB_PORT is already in use. Stop the existing service first." >&2
  exit 1
fi

cd "$ROOT_DIR"

wait_for_backend() {
  local attempts=160
  for ((index=1; index<=attempts; index++)); do
    if curl --fail --silent "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    if [[ -n "${BACKEND_PID:-}" ]] && ! pid_is_running "$BACKEND_PID"; then
      return 1
    fi
    sleep 0.25
  done
  return 1
}

wait_for_web() {
  local attempts=40
  for ((index=1; index<=attempts; index++)); do
    if curl --fail --silent "http://127.0.0.1:${WEB_PORT}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

if [[ "$START_BACKEND" == "1" || "$START_BACKEND" == "true" ]]; then
  echo "启动 ForgeDesk 后端：http://127.0.0.1:${BACKEND_PORT}"
  nohup npm run backend:dev >"$BACKEND_LOG_FILE" 2>&1 &
  BACKEND_PID=$!
  echo "$BACKEND_PID" >"$BACKEND_PID_FILE"

  if ! wait_for_backend; then
    echo "后端未在规定时间内通过健康检查，请查看：$BACKEND_LOG_FILE" >&2
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    rm -f "$BACKEND_PID_FILE"
    exit 1
  fi
fi

if [[ "$START_WEB" == "1" ]]; then
  echo "启动 ForgeDesk 前端：http://127.0.0.1:${WEB_PORT}"
  nohup npm --workspace apps/desktop run dev:vite >"$WEB_LOG_FILE" 2>&1 &
  WEB_PID=$!
  echo "$WEB_PID" >"$WEB_PID_FILE"

  if ! wait_for_web; then
    echo "前端未在规定时间内响应，请查看：$WEB_LOG_FILE" >&2
    kill "$WEB_PID" >/dev/null 2>&1 || true
    rm -f "$WEB_PID_FILE"
    if [[ -n "${BACKEND_PID:-}" ]]; then
      kill "$BACKEND_PID" >/dev/null 2>&1 || true
      rm -f "$BACKEND_PID_FILE"
    fi
    exit 1
  fi
fi

echo
echo "ForgeDesk 启动完成。"
[[ "$START_WEB" == "1" ]] && echo "前端： http://127.0.0.1:${WEB_PORT}"
[[ "$START_BACKEND" == "1" || "$START_BACKEND" == "true" ]] && echo "后端： http://127.0.0.1:${BACKEND_PORT}"
echo "运行日志：$RUNTIME_DIR"
echo "停止：npm run stop"
