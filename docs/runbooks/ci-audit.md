# CI audit

The `check` job runs `npm run check:audit`, which is `node scripts/audit-check.mjs`.

The script runs `npm audit --json --audit-level=high` and reads that JSON. High and critical advisories fail the job. Moderate, low, and info advisories stay reported by npm and do not fail the job. The audit level is `high`.

## Allowlist

`scripts/audit-check.mjs` has one entry:

| id | expires | reason |
| --- | --- | --- |
| `GHSA-fc5q-39xc-vjpf` | `2026-12-01` | picomatch `<=4.0.7` (ReDoS via repeated extglobs) has no patched release. Every installed copy is a devDependency of vitest, vite, or tinyglobby. |

The entry waives that advisory id only while all of these stay true:

- The UTC date is before `2026-12-01`. On `2026-12-01` the waiver stops and the advisory fails the job again.
- Every installed copy is a dev dependency. The script reads `package-lock.json` and requires `dev: true` or `devOptional: true` on each `npm audit` node and on every lockfile copy of that package. A copy that production can reach fails the job, and the waiver is not applied.
- No stable release of the package sits outside the advisory range. The script reads `npm view picomatch versions --json`. Prereleases are ignored. A stable version outside `<=4.0.7` means a patched picomatch is published, the waiver stops, and the job fails on the advisory again.

npm currently suggests fixing the finding by moving vitest to `3.1.4`, a semver-major downgrade of a different package. The waiver looks for a stable picomatch release outside `<=4.0.7`. The latest stable picomatch when this entry was added was `4.0.7`.

The expired entry can stay in the file. The date check is what makes the job fail again. Delete the entry in a follow-up once the package is upgraded or the finding is otherwise gone.

## Dependency path

Checked on the lockfile with `npm ls picomatch --all` and `npm audit --omit=dev` (zero vulnerabilities). picomatch `4.0.7` is installed only as a devDependency:

- `vitest@5.0.5` → `picomatch@4.0.7`
- `vitest@5.0.5` → `vite@8.3.4` → `picomatch@4.0.7`
- `vitest@5.0.5` → `tinyglobby@0.2.17` → `picomatch@4.0.7`
- `vitest@5.0.5` → `tinyglobby@0.2.17` → `fdir@6.5.0` → `picomatch@4.0.7` (deduped)
- `typescript-eslint@8.71.2` → `@typescript-eslint/typescript-estree@8.71.2` → `tinyglobby@0.2.17` → `picomatch@4.0.7`

`typescript-eslint`, `vitest`, and `vite` are devDependencies. `npm audit --omit=dev` reports no vulnerabilities, so production dependencies do not reach this advisory. Lockfile copies:

- `node_modules/vitest/node_modules/picomatch`
- `node_modules/vite/node_modules/picomatch`
- `node_modules/tinyglobby/node_modules/picomatch`

Each of those entries is `dev: true`.

Parents that npm marks high only because they depend on this advisory (`fdir`, `tinyglobby`, `vite`, `vitest`, and `@typescript-eslint/typescript-estree` through `tinyglobby`) follow the same waiver. A different high or critical advisory on any of those packages still fails the job.

## Other gates

Lighthouse (`bash scripts/ci-lighthouse.sh`), the Stripe key check, gitleaks, the database-write allowlist, the member-route check, lint, typecheck, unit tests, the build, the client-bundle scan, and end-to-end tests are separate steps.
