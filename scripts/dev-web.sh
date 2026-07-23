#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${FORGEDESK_DEV_CONFIG:-$HOME/.forgedesk/dev.env}"
START_BACKEND="${FORGEDESK_START_BACKEND:-0}"

if [[ -f "$CONFIG_FILE" ]]; then
  # 本地开发偏好，不属于仓库配置。
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  START_BACKEND="${FORGEDESK_START_BACKEND:-$START_BACKEND}"
fi

case "${1:-}" in
  --with-backend) START_BACKEND=1 ;;
  --web-only) START_BACKEND=0 ;;
  "") ;;
  --help)
    echo "用法：npm run dev:web [-- --with-backend|--web-only]"
    exit 0
    ;;
  *)
    echo "未知参数：$1" >&2
    exit 1
    ;;
esac

cd "$ROOT_DIR"
if [[ "$START_BACKEND" == "1" || "$START_BACKEND" == "true" ]]; then
  bash ./scripts/start.sh --backend-only
fi

exec npm --workspace apps/desktop run dev:vite
