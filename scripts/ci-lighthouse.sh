#!/usr/bin/env bash
# Prefer the gate committed on origin/main so a pull request cannot loosen its own check.
# GitHub Actions still loads this workflow file from the pull request, so a change to
# this bootstrap can bypass the pin. The TypeScript gate itself is taken from main
# once src/lib/lighthouse-gate.ts is on main.
set -euo pipefail
root="$(pwd)"
git fetch origin main
if git cat-file -e origin/main:src/lib/lighthouse-gate.ts; then
  echo "Running the Lighthouse gate from origin/main"
  git worktree remove --force /tmp/lh-gate >/dev/null 2>&1 || true
  rm -rf /tmp/lh-gate
  git worktree add --detach /tmp/lh-gate origin/main
  status=0
  LH_APP_ROOT="$root" npx tsx /tmp/lh-gate/scripts/check-lighthouse.ts || status=$?
  git worktree remove --force /tmp/lh-gate >/dev/null 2>&1 || true
  exit "$status"
fi
echo "origin/main has no lighthouse-gate.ts yet. This checkout's gate runs once so the pin can land on main."
npx tsx scripts/check-lighthouse.ts
