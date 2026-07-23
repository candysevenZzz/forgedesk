#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_PORT=1420

if [[ -f "$HOME/.cargo/env" ]]; then
  # 兼容新开的 shell 尚未加载 Rust 环境的情况
  # shellcheck disable=SC1090
  source "$HOME/.cargo/env"
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令：$1" >&2
    exit 1
  fi
}

require_command npm

if ! command -v cargo >/dev/null 2>&1 || ! command -v rustc >/dev/null 2>&1; then
  cat >&2 <<'EOF'
未检测到 Rust 工具链，当前无法启动 Tauri 桌面端。

请先安装 Rust：
  1. 执行：curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  2. 执行：source "$HOME/.cargo/env"
  3. 验证：cargo -V && rustc -V

安装完成后重新执行：
  npm run dev:desktop
EOF
  exit 1
fi

existing_pid="$(lsof -nP -iTCP:"$DESKTOP_PORT" -sTCP:LISTEN -t 2>/dev/null || true)"
if [[ -n "$existing_pid" ]]; then
  existing_command="$(ps -p "$existing_pid" -o command= 2>/dev/null || true)"
  if [[ "$existing_command" == *"/Users/candy_seven/test/forgedesk/"* ]] || [[ "$existing_command" == *"vite --host 127.0.0.1 --port ${DESKTOP_PORT}"* ]]; then
    echo "检测到 ForgeDesk 遗留的前端进程占用了端口 ${DESKTOP_PORT}，正在自动清理（PID ${existing_pid}）..."
    kill "$existing_pid" >/dev/null 2>&1 || true
    for _ in {1..20}; do
      if ! kill -0 "$existing_pid" >/dev/null 2>&1; then
        break
      fi
      sleep 0.3
    done
  fi
fi

if lsof -nP -iTCP:"$DESKTOP_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "端口 ${DESKTOP_PORT} 已被其他进程占用，无法启动桌面端。" >&2
  echo "请先执行以下命令之一后重试：" >&2
  echo "  npm run stop" >&2
  echo "  lsof -nP -iTCP:${DESKTOP_PORT} -sTCP:LISTEN" >&2
  exit 1
fi

cd "$ROOT_DIR"
exec npm --workspace apps/desktop run tauri:dev
