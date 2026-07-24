#!/usr/bin/env bash
# 本脚本在开发机执行：打包 -> 上传 -> 让服务器原子切换版本。
# 日常使用：npm run deploy:server
# 不要直接手动运行 apply-release.sh；它必须由本脚本通过 SSH 以 root 权限传到服务器执行。
set -euo pipefail

# 从 scripts/deploy/ 回到项目根目录。
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# 部署目标和私钥属于个人/服务器配置，因此默认从被 Git 忽略的 .forgedesk/deploy.env 读取。
# 如需使用另一份配置，可在命令前设置 FORGEDESK_DEPLOY_CONFIG=/path/to/file。
CONFIG_FILE="${FORGEDESK_DEPLOY_CONFIG:-$ROOT_DIR/.forgedesk/deploy.env}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Deployment config is missing: $CONFIG_FILE" >&2
  echo "Copy scripts/deploy/deploy.env.example to .forgedesk/deploy.env and fill in the target." >&2
  exit 1
fi

# 该文件包含服务器地址和 SSH 私钥路径，必须保持 Git 忽略，不能提交。
# shellcheck disable=SC1090
source "$CONFIG_FILE"

require_value() {
  # 用变量名检查必填项，避免部署到错误服务器或无密钥连接。
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required deployment setting: $name" >&2
    exit 1
  fi
}

require_value FORGEDESK_DEPLOY_HOST
require_value FORGEDESK_DEPLOY_USER
require_value FORGEDESK_DEPLOY_SSH_KEY
[[ -f "$FORGEDESK_DEPLOY_SSH_KEY" ]] || { echo "SSH key does not exist: $FORGEDESK_DEPLOY_SSH_KEY" >&2; exit 1; }

# 以下是当前 1Panel + OpenResty + java21 容器的默认路径。通常无需写入 deploy.env；
# 只有服务器布局变化时才覆盖相应变量。
FORGEDESK_DEPLOY_WEB_ROOT="${FORGEDESK_DEPLOY_WEB_ROOT:-/opt/1panel/apps/openresty/openresty/root/forgedesk}"
FORGEDESK_DEPLOY_BACKEND_JAR="${FORGEDESK_DEPLOY_BACKEND_JAR:-/www/forgedesk-backend.jar}"
FORGEDESK_DEPLOY_BACKEND_CONTAINER="${FORGEDESK_DEPLOY_BACKEND_CONTAINER:-java21}"
FORGEDESK_DEPLOY_HEALTH_URL="${FORGEDESK_DEPLOY_HEALTH_URL:-http://127.0.0.1:8080/actuator/health}"
REMOTE_RELEASE_DIR="${FORGEDESK_DEPLOY_RELEASE_DIR:-/home/$FORGEDESK_DEPLOY_USER/.forgedesk/releases}"

# 1. 本机生成包含 frontend/、backend/ 和版本号的压缩包。
artifact_output="$(bash "$ROOT_DIR/scripts/deploy/build-artifact.sh")"
printf '%s\n' "$artifact_output"
ARTIFACT_FILE="$(printf '%s\n' "$artifact_output" | sed -n 's/^Release artifact: //p' | tail -1)"
[[ -f "$ARTIFACT_FILE" ]] || { echo "Unable to locate the generated release artifact." >&2; exit 1; }

# 2. 使用指定私钥连接服务器。BatchMode 禁止等待交互输入；首次连接仅记录主机指纹。
SSH_OPTIONS=(-i "$FORGEDESK_DEPLOY_SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
REMOTE_TARGET="$FORGEDESK_DEPLOY_USER@$FORGEDESK_DEPLOY_HOST"
REMOTE_ARTIFACT="$REMOTE_RELEASE_DIR/$(basename "$ARTIFACT_FILE")"

# 3. 先确保服务器上的普通用户发布目录存在，再上传压缩包。
ssh "${SSH_OPTIONS[@]}" "$REMOTE_TARGET" "mkdir -p $(printf '%q' "$REMOTE_RELEASE_DIR")"
scp "${SSH_OPTIONS[@]}" "$ARTIFACT_FILE" "$REMOTE_TARGET:$REMOTE_ARTIFACT"

# 4. 将服务器切换脚本通过标准输入传过去。参数使用 %q 转义，避免路径中的空格被错误拆分。
# sudo 仅在服务器执行替换静态文件、JAR 与重启容器时使用，SSH 登录仍然是普通用户。
remote_command=$(printf 'sudo bash -s -- %q %q %q %q %q' \
  "$REMOTE_ARTIFACT" \
  "$FORGEDESK_DEPLOY_WEB_ROOT" \
  "$FORGEDESK_DEPLOY_BACKEND_JAR" \
  "$FORGEDESK_DEPLOY_BACKEND_CONTAINER" \
  "$FORGEDESK_DEPLOY_HEALTH_URL")
ssh "${SSH_OPTIONS[@]}" "$REMOTE_TARGET" "$remote_command" <"$ROOT_DIR/scripts/deploy/apply-release.sh"
