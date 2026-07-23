#!/usr/bin/env bash
set -euo pipefail

MINIMUM_VERSION="3.6.3"
MINIMUM_JAVA_VERSION=21
declare -a candidates=()
declare -a java_homes=()

if [[ -n "${FORGEDESK_JAVA_HOME:-}" ]]; then
  java_homes+=("$FORGEDESK_JAVA_HOME")
fi
if [[ -d "/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home" ]]; then
  java_homes+=("/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home")
fi
if command -v /usr/libexec/java_home >/dev/null 2>&1; then
  java_homes+=("$(/usr/libexec/java_home -v 21 2>/dev/null || true)")
fi
if [[ -n "${JAVA_HOME:-}" ]]; then
  java_homes+=("$JAVA_HOME")
fi

if [[ -n "${FORGEDESK_MVN:-}" ]]; then
  candidates+=("$FORGEDESK_MVN")
fi
if [[ -x "/opt/homebrew/opt/maven/bin/mvn" ]]; then
  candidates+=("/opt/homebrew/opt/maven/bin/mvn")
fi
if command -v mvn >/dev/null 2>&1; then
  candidates+=("$(command -v mvn)")
fi

version_at_least() {
  local actual="$1"
  local required="$2"
  local actual_major actual_minor actual_patch required_major required_minor required_patch
  IFS=. read -r actual_major actual_minor actual_patch <<<"$actual"
  IFS=. read -r required_major required_minor required_patch <<<"$required"
  actual_patch="${actual_patch%%[^0-9]*}"
  required_patch="${required_patch%%[^0-9]*}"
  (( actual_major > required_major )) || { (( actual_major == required_major )) && (( actual_minor > required_minor || (actual_minor == required_minor && actual_patch >= required_patch) )); }
}

java_version() {
  "$1/bin/java" -version 2>&1 | awk -F '"' '/version/ { print $2; exit }'
}

java_version_at_least() {
  local version="$1"
  local major
  major="${version%%.*}"
  if [[ "$major" == "1" ]]; then
    version="${version#1.}"
    major="${version%%.*}"
  fi
  [[ "$major" =~ ^[0-9]+$ ]] && (( major >= MINIMUM_JAVA_VERSION ))
}

selected_java_home=""
selected_java_version=""
for java_home in "${java_homes[@]}"; do
  [[ -n "$java_home" && -x "$java_home/bin/java" ]] || continue
  detected_java_version="$(java_version "$java_home")"
  if [[ -n "$detected_java_version" ]] && java_version_at_least "$detected_java_version"; then
    selected_java_home="$java_home"
    selected_java_version="$detected_java_version"
    break
  fi
done

if [[ -z "$selected_java_home" ]]; then
  cat >&2 <<EOF
未找到 Java ${MINIMUM_JAVA_VERSION} 或更高版本。ForgeDesk 后端使用 Java 21，不能使用 Java 8。
当前 JAVA_HOME：${JAVA_HOME:-<未设置>}

请安装 JDK 21+，或指定：
  FORGEDESK_JAVA_HOME=/path/to/jdk npm run start:full
EOF
  exit 1
fi

for candidate in "${candidates[@]}"; do
  [[ -x "$candidate" ]] || continue
  version="$($candidate --version 2>&1 | awk '/Apache Maven/{ print $3; exit }')"
  if [[ -n "$version" ]] && version_at_least "$version" "$MINIMUM_VERSION"; then
    echo "ForgeDesk Maven: $candidate ($version)"
    echo "ForgeDesk JDK: $selected_java_home (Java $selected_java_version)"
    exec env JAVA_HOME="$selected_java_home" PATH="$selected_java_home/bin:$PATH" "$candidate" "$@"
  fi
done

cat >&2 <<EOF
未找到 Maven ${MINIMUM_VERSION} 或更高版本。
当前 PATH 中的 mvn：$(command -v mvn 2>/dev/null || echo '未安装')

可选修复：
  brew install maven
或指定 Maven：
  FORGEDESK_MVN=/path/to/mvn npm run start:full
EOF
exit 1
