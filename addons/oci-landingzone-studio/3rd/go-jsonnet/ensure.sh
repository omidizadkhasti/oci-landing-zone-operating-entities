#!/usr/bin/env bash

set -euo pipefail

sha256=(shasum -a 256)
if command -v sha256sum >/dev/null 2>&1; then sha256=(sha256sum); fi

runtime_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
studio_dir="$(cd "$runtime_dir/../.." && pwd)"
wasm_opt="$studio_dir/node_modules/.bin/wasm-opt"

runtime_fingerprint() {
  local go_version
  go_version="$(go env GOVERSION)"
  {
    "${sha256[@]}" build.sh main.go go.mod go.sum
    printf '%s  %s\n' "$go_version" 'go-version'
    "$wasm_opt" --version | "${sha256[@]}" | sed 's/  -$/  wasm-opt-version/'
  } | "${sha256[@]}" | awk '{print $1}'
}

cd "$runtime_dir"

if [[ -x "$wasm_opt" && -s libjsonnet.wasm && -f .runtime-build-fingerprint ]] \
  && [[ "$(runtime_fingerprint)" == "$(<.runtime-build-fingerprint)" ]]; then
  exit 0
fi

echo "Preparing the OCI Landing Zone Studio Jsonnet runtime..."
bash "$runtime_dir/build.sh"
