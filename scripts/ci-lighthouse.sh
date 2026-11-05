#!/usr/bin/env bash
# GitHub Actions loads this file and .github/workflows/ci.yml from the pull request.
# A pull request can change either one and skip the pin. That limit stays.
# The TypeScript gate is what this script pins to origin/main.
set -euo pipefail

root="$(pwd)"
head="$(git rev-parse HEAD)"
git fetch origin main
main_sha="$(git rev-parse origin/main)"

cleanup() {
  status=$?
  if [[ -e /tmp/lh-gate/node_modules || -L /tmp/lh-gate/node_modules ]]; then
    rm -f /tmp/lh-gate/node_modules
  fi
  git worktree remove --force /tmp/lh-gate >/dev/null 2>&1 || true
  rm -rf /tmp/lh-gate /tmp/lh-app
  exit "$status"
}
trap cleanup EXIT

git worktree remove --force /tmp/lh-gate >/dev/null 2>&1 || true
rm -rf /tmp/lh-gate
git worktree add --detach /tmp/lh-gate "$main_sha"
ln -sfn "$root/node_modules" /tmp/lh-gate/node_modules

on_main_event=0
if [[ "${GITHUB_EVENT_NAME:-}" == "schedule" ]]; then
  on_main_event=1
fi
if [[ "${GITHUB_EVENT_NAME:-}" == "push" && "${GITHUB_REF:-}" == "refs/heads/main" ]]; then
  on_main_event=1
fi

if git rev-parse --verify --quiet "${main_sha}:src/lib/lighthouse-gate.ts" >/dev/null \
  && git rev-parse --verify --quiet "${main_sha}:scripts/check-lighthouse.ts" >/dev/null; then
  echo "lighthouse gate source: origin/main ${main_sha} at /tmp/lh-gate"
else
  if [[ "$on_main_event" == 1 ]]; then
    echo "::error::lighthouse gate fallback is unexpected on ${GITHUB_EVENT_NAME:-} ${GITHUB_REF:-}. origin/main ${main_sha} has no src/lib/lighthouse-gate.ts."
    exit 1
  fi
  echo "lighthouse gate: origin/main ${main_sha} has no src/lib/lighthouse-gate.ts yet."
  echo "lighthouse gate files: ${head} placed in /tmp/lh-gate. A checkout fallback is a failure, not this path."
  git -C /tmp/lh-gate checkout "$head" -- scripts/check-lighthouse.ts src/lib/lighthouse-gate.ts
fi

if [[ ! -f /tmp/lh-gate/scripts/check-lighthouse.ts || ! -f /tmp/lh-gate/src/lib/lighthouse-gate.ts ]]; then
  echo "::error::lighthouse gate files are missing from /tmp/lh-gate"
  exit 1
fi

if [[ ! -L /tmp/lh-gate/node_modules ]]; then
  echo "::error::/tmp/lh-gate/node_modules is not a symlink, so the origin/main gate cannot resolve dependencies"
  exit 1
fi
echo "lighthouse gate node_modules: symlink -> $(readlink /tmp/lh-gate/node_modules)"

node --input-type=module -e '
import { createRequire } from "node:module"
const require = createRequire("/tmp/lh-gate/package.json")
const resolved = require.resolve("@playwright/test")
console.log("lighthouse gate playwright: " + resolved)
'

# The origin/main gate moves $LH_APP_ROOT/.lighthouseci to /tmp/lhci-out-* with rename().
# On a runner where /tmp is another device, that throws EXDEV and the job stops
# before any score is read. Clone the built checkout onto /tmp so the move stays
# on one filesystem. The gate file and its thresholds stay the origin/main copy.
lh_app_root="$root"
if [[ "$(stat -c %d "$root")" != "$(stat -c %d /tmp)" ]]; then
  echo "lighthouse app root: ${root} and /tmp are different devices; cloning the build onto /tmp"
  rm -rf /tmp/lh-app
  git clone --shared "$root" /tmp/lh-app
  tar -C "$root" --exclude .git --exclude node_modules --exclude .lighthouseci -cf - . | tar -C /tmp/lh-app -xf -
  ln -sfn "$root/node_modules" /tmp/lh-app/node_modules
  lh_app_root=/tmp/lh-app
else
  echo "lighthouse app root: ${root} is on the same device as /tmp"
fi

rm -f /tmp/lh-gate-ran
status=0
(
  cd /tmp/lh-gate
  LH_APP_ROOT="$lh_app_root" LH_GATE_DIR=/tmp/lh-gate npx tsx scripts/check-lighthouse.ts
) || status=$?

if [[ ! -f /tmp/lh-gate-ran ]]; then
  echo "::error::lighthouse gate did not record that its own copy ran. Refusing a checkout fallback."
  exit 1
fi
stamp="$(cat /tmp/lh-gate-ran)"
echo "lighthouse gate stamp: ${stamp}"
if [[ "$stamp" != /tmp/lh-gate/scripts/check-lighthouse.ts ]]; then
  echo "::error::lighthouse gate ran from ${stamp} instead of /tmp/lh-gate/scripts/check-lighthouse.ts"
  exit 1
fi

if [[ "$status" -ne 0 && "${GITHUB_EVENT_NAME:-}" == "schedule" ]]; then
  echo "::error::Nightly Lighthouse gate failed."
fi
exit "$status"
