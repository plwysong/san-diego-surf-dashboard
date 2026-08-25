#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

# GNU timeout bounds the build in CI. It is a guardrail, not a correctness
# requirement, so fall back to gtimeout and then to an unbounded run rather
# than failing on hosts that do not ship coreutils (macOS).
run_bounded() {
  local bound="${SITES_BUILD_TIMEOUT:-3m}"
  local kill_after="${SITES_BUILD_KILL_AFTER:-10s}"

  if command -v timeout >/dev/null; then
    timeout --signal=TERM --kill-after="${kill_after}" "${bound}" "$@"
  elif command -v gtimeout >/dev/null; then
    gtimeout --signal=TERM --kill-after="${kill_after}" "${bound}" "$@"
  else
    echo "[sites] GNU timeout unavailable; running the build unbounded." >&2
    "$@"
  fi
}

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm ci (or npm run install:ci) and wait for it to finish before building." >&2
  exit 69
fi

echo "Running bounded vinext build..."
run_bounded "${vinext}" build

"${script_dir}/validate-artifact.sh"
