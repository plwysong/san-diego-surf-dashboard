#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

command -v curl >/dev/null || {
  echo "install-ci.sh requires curl for the locked-tarball preflight." >&2
  exit 69
}
command -v sha256sum >/dev/null || command -v shasum >/dev/null || {
  echo "install-ci.sh requires sha256sum or shasum for cache and install verification." >&2
  exit 69
}

# Integrity verification is mandatory; the concurrency guards below are not.
# flock, /proc and GNU timeout are Linux-image conveniences, so degrade to a
# warning instead of refusing to install on other hosts (macOS).
sha256_of() {
  if command -v sha256sum >/dev/null; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

run_bounded() {
  local bound="${SITES_INSTALL_TIMEOUT:-8m}"
  local kill_after="${SITES_INSTALL_KILL_AFTER:-15s}"

  if command -v timeout >/dev/null; then
    timeout --signal=TERM --kill-after="${kill_after}" "${bound}" "$@"
  elif command -v gtimeout >/dev/null; then
    gtimeout --signal=TERM --kill-after="${kill_after}" "${bound}" "$@"
  else
    echo "[sites] GNU timeout unavailable; running the install unbounded." >&2
    "$@"
  fi
}

runtime_root="${SITES_PROJECT_ROOT}/.sites-runtime"
expected_home="${runtime_root}/home"
expected_cache="${runtime_root}/npm-cache"

echo "[sites] validating writable install environment"
if [[ "${HOME}" != "${expected_home}" ]]; then
  echo "Expected HOME=${expected_home}, got HOME=${HOME}." >&2
  exit 78
fi
# npm 11 refuses `npm config get cache` ("the cache option is protected"), and
# `npm config ls -l` redacts path segments that look like secrets, so neither
# can be compared exactly. The authoritative enforcement is the explicit
# `--cache` passed to `npm ci` below; this check stays as a diagnostic.
actual_cache="$(npm config ls -l 2>/dev/null | sed -n 's/^cache = //p' | head -1 | sed 's/^"//; s/"$//')"
if [[ -n "${actual_cache}" && "${actual_cache}" != "${expected_cache}" ]]; then
  echo "[sites] note: npm reports cache ${actual_cache}; forcing ${expected_cache} via --cache." >&2
fi

# Writability is the real gate and is verified directly.
touch "${HOME}/.sites-write-test" "${expected_cache}/.sites-write-test"
rm -f "${HOME}/.sites-write-test" "${expected_cache}/.sites-write-test"
echo "[sites] environment passed: HOME=${HOME}, cache=${expected_cache}"

lock_file="${runtime_root}/install.lock"
exec 9>"${lock_file}"
if command -v flock >/dev/null; then
  if ! flock -n 9; then
    echo "Another dependency install is already running for ${SITES_PROJECT_ROOT}." >&2
    exit 75
  fi
else
  echo "[sites] flock unavailable; skipping the cross-process install lock." >&2
fi

# Catch an installer started outside this helper. Linux exposes both its command
# line and working directory through /proc, so avoid broad process-name matches.
if [[ -d /proc ]]; then
  for process in /proc/[0-9]*; do
    pid="${process##*/}"
    [[ "${pid}" != "$$" && "${pid}" != "${PPID}" ]] || continue
    process_cwd="$(readlink -f "${process}/cwd" 2>/dev/null || true)"
    [[ "${process_cwd}" == "${SITES_PROJECT_ROOT}" ]] || continue
    process_command="$(tr '\0' ' ' <"${process}/cmdline" 2>/dev/null || true)"
    if [[ "${process_command}" == *"npm ci"* ]]; then
      echo "Another npm ci is visible in ${SITES_PROJECT_ROOT}; refusing to overlap installs." >&2
      exit 75
    fi
  done
fi

lockfile_sha256="$(sha256_of "${SITES_PROJECT_ROOT}/package-lock.json")"
use_seeded_cache=0
seed_cache="${SITES_NPM_CACHE_SEED:-}"
if [[ -n "${seed_cache}" && -d "${seed_cache}" ]]; then
  seed_lockfile_sha256="$(cat "${seed_cache}/.sites-lockfile-sha256" 2>/dev/null || true)"
  if [[ "${seed_lockfile_sha256}" == "${lockfile_sha256}" ]]; then
    echo "[sites] restoring image-seeded npm cache"
    cp -a "${seed_cache}/." "${expected_cache}/"
    use_seeded_cache=1
    echo "[sites] image cache seed matched; registry fallback remains available"
  else
    echo "[sites] image cache seed does not match this lockfile; using the network path"
  fi
fi

locked_vinext_output="$({ node --input-type=module - "${SITES_PROJECT_ROOT}/package-lock.json" <<'NODE'
import { readFile } from "node:fs/promises";

const lock = JSON.parse(await readFile(process.argv[2], "utf8"));
const vinext = lock.packages?.["node_modules/vinext"];
if (!vinext?.resolved || !vinext?.integrity) {
  throw new Error("package-lock.json does not contain a resolved, integrity-pinned vinext tarball");
}
console.log(vinext.resolved);
console.log(vinext.integrity);
NODE
} 2>/dev/null)" || {
  echo "Could not read the integrity-pinned vinext tarball from package-lock.json." >&2
  exit 65
}
locked_tarball="$(printf '%s\n' "${locked_vinext_output}" | sed -n '1p')"
locked_integrity="$(printf '%s\n' "${locked_vinext_output}" | sed -n '2p')"
if [[ -z "${locked_tarball}" || -z "${locked_integrity}" ]]; then
  echo "Expected exactly one Vinext URL and integrity value from package-lock.json." >&2
  exit 65
fi

if [[ "${use_seeded_cache}" == "0" ]]; then
  registry="$(npm config get registry)"
  preflight_url="$({ node --input-type=module - "${locked_tarball}" "${registry}" <<'NODE'
const locked = new URL(process.argv[2]);
const registry = new URL(process.argv[3]);
if (locked.hostname === "registry.npmjs.org") {
  locked.protocol = registry.protocol;
  locked.host = registry.host;
  locked.pathname = `${registry.pathname.replace(/\/$/, "")}${locked.pathname}`;
}
process.stdout.write(locked.href);
NODE
} 2>/dev/null)" || {
  echo "Could not construct the locked-tarball preflight URL." >&2
  exit 65
  }

  preflight_dir="${runtime_root}/preflight"
  preflight_tarball="${preflight_dir}/vinext.tgz"
  mkdir -p "${preflight_dir}"

  echo "[sites] downloading the complete locked vinext tarball"
  curl \
    --fail \
    --location \
    --silent \
    --show-error \
    --retry 0 \
    --connect-timeout 15 \
    --max-time 120 \
    --output "${preflight_tarball}" \
    "${preflight_url}"

  echo "[sites] verifying locked vinext tarball integrity"
  node --input-type=module - "${preflight_tarball}" "${locked_integrity}" <<'NODE'
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const [algorithm, expected] = process.argv[3].split("-", 2);
if (!algorithm || !expected) {
  throw new Error(`unsupported integrity value: ${process.argv[3]}`);
}
const actual = createHash(algorithm)
  .update(await readFile(process.argv[2]))
  .digest("base64");
if (actual !== expected) {
  throw new Error(`vinext tarball integrity mismatch for ${algorithm}`);
}
NODE
  echo "[sites] network and integrity preflight passed"
fi

echo "[sites] running exactly one bounded npm ci"
export NPM_CONFIG_MAXSOCKETS=1
export NPM_CONFIG_FETCH_RETRIES=0
export NPM_CONFIG_FETCH_TIMEOUT=30000
npm_ci_args=(ci --cache "${expected_cache}")
if [[ "${use_seeded_cache}" == "1" ]]; then
  npm_ci_args+=(--prefer-offline)
fi
run_bounded npm "${npm_ci_args[@]}"

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "npm ci exited successfully but node_modules/.bin/vinext is unavailable." >&2
  exit 69
fi

node --input-type=module - "${SITES_PROJECT_ROOT}/node_modules/.sites-install.json" "${lockfile_sha256}" <<'NODE'
import { writeFile } from "node:fs/promises";

await writeFile(
  process.argv[2],
  `${JSON.stringify({
    lockfile_sha256: process.argv[3],
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
  }, null, 2)}\n`,
);
NODE
echo "[sites] npm ci passed and vinext is available"
