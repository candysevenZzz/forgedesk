#!/usr/bin/env bash
# 本脚本只在开发机执行：构建前端和后端，并将两者打成一个可上传的发布包。
# 日常使用：npm run build:server
# 只生成构建物，不会连接服务器，也不会修改服务器上的任何文件。
set -euo pipefail

# 从 scripts/deploy/ 回到项目根目录，保证无论从哪个终端目录运行都能找到项目文件。
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# 发布包默认放在 Git 忽略的 .forgedesk/releases/，不会污染源码或被提交。
RELEASE_DIR="${FORGEDESK_RELEASE_DIR:-$ROOT_DIR/.forgedesk/releases}"
# 版本号默认使用 UTC 时间，避免同一台机器连续构建时覆盖旧包；可通过环境变量指定固定版本号。
VERSION="${FORGEDESK_RELEASE_VERSION:-$(date -u +%Y%m%d%H%M%S)}"
# 先在系统临时目录组装包，完成或失败后都会自动清理。
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/forgedesk-release.XXXXXX")"
ARTIFACT_FILE="$RELEASE_DIR/forgedesk-$VERSION.tar.gz"

cleanup() {
  # trap 会在脚本退出时调用此函数，防止临时构建目录堆积。
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

mkdir -p "$RELEASE_DIR"
cd "$ROOT_DIR"

# 第 1 步：构建浏览器前端，结果写入 apps/desktop/dist/。
echo "[1/3] Building ForgeDesk web assets..."
npm --workspace apps/desktop run build

# 第 2 步：构建可执行 Spring Boot JAR。按当前约定跳过单测，仍会执行格式和编译检查。
echo "[2/3] Building ForgeDesk backend JAR..."
bash ./scripts/maven.sh -f apps/backend/pom.xml clean package -DskipTests

# 只选择 Spring Boot 最终 JAR，排除 Maven 生成的 .original 备份文件。
BACKEND_JAR="$(find apps/backend/target -maxdepth 1 -type f -name 'forgedesk-backend-*.jar' ! -name '*-original.jar' | head -1)"
if [[ -z "$BACKEND_JAR" ]]; then
  echo "Backend JAR was not created." >&2
  exit 1
fi

# 第 3 步：统一发布包结构。服务器只需要解压这个压缩包，无需安装 Node 或 Maven。
mkdir -p "$STAGING_DIR/frontend" "$STAGING_DIR/backend"
# 前端所有静态资源放在 frontend/；cp -a 保留目录结构和文件属性。
cp -a apps/desktop/dist/. "$STAGING_DIR/frontend/"
# 后端统一重命名，服务器脚本无需识别带版本号的 Maven 文件名。
install -m 0644 "$BACKEND_JAR" "$STAGING_DIR/backend/forgedesk-backend.jar"
# 写入版本标记，便于服务器备份目录和排障时识别本次发布。
printf '%s\n' "$VERSION" >"$STAGING_DIR/RELEASE_VERSION"

# macOS 会给文件附加扩展属性；--no-xattrs 可避免无意义的打包警告和跨平台元数据。
COPYFILE_DISABLE=1 tar --no-xattrs -C "$STAGING_DIR" -czf "$ARTIFACT_FILE" frontend backend RELEASE_VERSION
echo "Release artifact: $ARTIFACT_FILE"
