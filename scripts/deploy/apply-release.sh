#!/usr/bin/env bash
# 本脚本只在服务器执行，由 deploy-server.sh 通过 SSH 传入标准输入。
# 它负责：解压发布包 -> 备份旧版本 -> 原子替换前端/JAR -> 重启后端 -> 健康检查 -> 失败回滚。
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

# 这五个参数由开发机 deploy-server.sh 传入，顺序不能改变。
RELEASE_FILE="${1:?Release file is required}" # 已上传到服务器的 .tar.gz 发布包
WEB_ROOT="${2:?Web root is required}" # OpenResty 提供静态文件的目录
BACKEND_JAR="${3:?Backend JAR path is required}" # java21 容器挂载并启动的 JAR 文件
BACKEND_CONTAINER="${4:?Backend container is required}" # 需要重启的 Java 容器名
HEALTH_URL="${5:?Health URL is required}" # 仅服务器本机可访问的 Spring Boot 健康检查地址
# 每次发布都保留一份旧前端和旧 JAR，默认位于服务器 /opt/forgedesk/deploy-backups/。
BACKUP_ROOT="${FORGEDESK_DEPLOY_BACKUP_ROOT:-/opt/forgedesk/deploy-backups}"
# 解压目录和“下一版前端目录”放在临时位置；进程结束时会清理。
STAGING_DIR="$(mktemp -d /tmp/forgedesk-release.XXXXXX)"
RELEASE_NAME="$(basename "$RELEASE_FILE" .tar.gz)"
BACKUP_DIR="$BACKUP_ROOT/$RELEASE_NAME"
WEB_PARENT="$(dirname "$WEB_ROOT")"
WEB_NAME="$(basename "$WEB_ROOT")"
NEXT_WEB_ROOT="$WEB_PARENT/.${WEB_NAME}.next.$$"
WEB_BACKUP="$BACKUP_DIR/web"
JAR_BACKUP="$BACKUP_DIR/forgedesk-backend.jar"
WEB_SWAPPED=0
JAR_SWAPPED=0
WEB_BACKED_UP=0
JAR_BACKED_UP=0
DEPLOYMENT_SUCCEEDED=0
ROLLBACK_PERFORMED=0

# 本脚本会删除“正式前端目录”来恢复备份，因此拒绝根目录、当前目录和相对路径。
# 正常配置必须是明确的绝对路径，例如 /opt/1panel/.../root/forgedesk。
if [[ "$WEB_ROOT" == "/" || "$WEB_ROOT" == "." || "$WEB_ROOT" != /* ]]; then
  echo "Unsafe web root: $WEB_ROOT" >&2
  exit 1
fi
# 后端 JAR 同样必须是明确的绝对文件路径，避免错误覆盖无关文件。
if [[ "$BACKEND_JAR" == "/" || "$BACKEND_JAR" != /* ]]; then
  echo "Unsafe backend JAR path: $BACKEND_JAR" >&2
  exit 1
fi

rollback() {
  # 只有真正替换过文件时才回滚，且避免 EXIT trap 与显式失败路径重复执行。
  if [[ "$ROLLBACK_PERFORMED" -eq 1 || ( "$WEB_BACKED_UP" -eq 0 && "$JAR_BACKED_UP" -eq 0 ) ]]; then
    return
  fi
  ROLLBACK_PERFORMED=1
  echo "Deployment failed. Restoring the previous release..." >&2
  # 即使安装新 JAR 的过程中失败，只要备份已完成，就用备份覆盖目标文件。
  if [[ "$JAR_BACKED_UP" -eq 1 && -f "$JAR_BACKUP" ]]; then
    install -m 0644 "$JAR_BACKUP" "$BACKEND_JAR"
  fi
  # 即使“新目录改名为正式目录”失败，只要旧目录已挪到备份，也恢复旧目录。
  if [[ "$WEB_BACKED_UP" -eq 1 && -d "$WEB_BACKUP" ]]; then
    rm -rf "$WEB_ROOT"
    mv "$WEB_BACKUP" "$WEB_ROOT"
  fi
  # 仅在文件已开始替换时重启，以免发布包校验失败也无故中断正常服务。
  if [[ "$WEB_SWAPPED" -eq 1 || "$JAR_SWAPPED" -eq 1 || "$JAR_BACKED_UP" -eq 1 ]]; then
    docker restart "$BACKEND_CONTAINER" >/dev/null || true
  fi
}

cleanup() {
  # 无论成功、失败还是中断都删除临时目录；失败时自动尝试恢复旧版本。
  if [[ "$DEPLOYMENT_SUCCEEDED" -ne 1 ]]; then
    rollback
  fi
  rm -rf "$STAGING_DIR"
  rm -rf "$NEXT_WEB_ROOT"
}
trap cleanup EXIT

if [[ ! -f "$RELEASE_FILE" ]]; then
  echo "Release artifact does not exist: $RELEASE_FILE" >&2
  exit 1
fi

# 1. 解压并校验发布包。缺少任一构建物时立刻失败，不触碰线上版本。
tar -xzf "$RELEASE_FILE" -C "$STAGING_DIR"
if [[ ! -f "$STAGING_DIR/frontend/index.html" || ! -f "$STAGING_DIR/backend/forgedesk-backend.jar" ]]; then
  echo "Release artifact is incomplete." >&2
  exit 1
fi

# 2. 先复制新的前端到同级临时目录。未复制完整前不会替换当前站点目录。
mkdir -p "$BACKUP_DIR" "$WEB_PARENT"
rm -rf "$NEXT_WEB_ROOT"
mkdir -p "$NEXT_WEB_ROOT"
cp -a "$STAGING_DIR/frontend/." "$NEXT_WEB_ROOT/"

# 3. 原子切换前端目录：旧目录改名为备份，新目录改名为正式目录。
# OpenResty 始终读取 WEB_ROOT，因此改名操作完成后请求会立即读到完整的新版本。
if [[ -d "$WEB_ROOT" ]]; then
  rm -rf "$WEB_BACKUP"
  mv "$WEB_ROOT" "$WEB_BACKUP"
  WEB_BACKED_UP=1
fi
mv "$NEXT_WEB_ROOT" "$WEB_ROOT"
WEB_SWAPPED=1

# 4. 备份旧 JAR，再替换为新 JAR。文件权限固定为可读，避免容器无权读取。
if [[ -f "$BACKEND_JAR" ]]; then
  install -m 0644 "$BACKEND_JAR" "$JAR_BACKUP"
  JAR_BACKED_UP=1
fi
install -m 0644 "$STAGING_DIR/backend/forgedesk-backend.jar" "$BACKEND_JAR"
JAR_SWAPPED=1

# 5. 重启 Java 容器并最多等待 120 秒。容器启动期间公网可能短暂返回 502，这是正常切换窗口。
docker restart "$BACKEND_CONTAINER" >/dev/null
for ((attempt = 1; attempt <= 120; attempt += 1)); do
  if curl --fail --silent "$HEALTH_URL" >/dev/null; then
    echo "Deployment completed: $RELEASE_NAME"
    DEPLOYMENT_SUCCEEDED=1
    exit 0
  fi
  sleep 1
done

# 健康检查超时会触发 EXIT trap 回滚前端和 JAR，然后重启旧后端。
exit 1
