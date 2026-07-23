#!/usr/bin/env bash
set -euo pipefail

MINIMUM_VERSION="3.6.3"
declare -a candidates=()

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

for candidate in "${candidates[@]}"; do
  [[ -x "$candidate" ]] || continue
  version="$($candidate --version 2>&1 | awk '/Apache Maven/{ print $3; exit }')"
  if [[ -n "$version" ]] && version_at_least "$version" "$MINIMUM_VERSION"; then
    exec "$candidate" "$@"
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
