import { spawnSync } from 'node:child_process'
import console from 'node:console'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * CI audit gate. Same threshold as `npm audit --audit-level=high`:
 * high and critical fail, moderate and below do not.
 *
 * One allowlist entry can waive a single advisory id. It applies only while
 * the UTC date is before `expires`, every installed copy is a dev dependency,
 * and no stable release of that package sits outside the advisory range.
 */
export const AUDIT_LEVEL = 'high'

export const ALLOWLIST = [
  {
    id: 'GHSA-fc5q-39xc-vjpf',
    expires: '2026-12-01',
    reason:
      'picomatch <=4.0.7 (ReDoS via repeated extglobs) has no patched release. Every installed copy is a devDependency of vitest, vite, or tinyglobby.',
  },
]

const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 }

function rank(severity) {
  return Object.prototype.hasOwnProperty.call(SEVERITY_RANK, severity) ? SEVERITY_RANK[severity] : -1
}

function advisoryId(via) {
  const url = typeof via?.url === 'string' ? via.url : ''
  const match = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i.exec(url)
  return match ? match[0] : null
}

function sameId(left, right) {
  return left.toLowerCase() === right.toLowerCase()
}

function utcDate(now) {
  return now.toISOString().slice(0, 10)
}

function expiryStillOpen(expires, now) {
  return typeof expires === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expires) && utcDate(now) < expires
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  }
}

function compareVersions(left, right) {
  if (left.major !== right.major) return left.major - right.major
  if (left.minor !== right.minor) return left.minor - right.minor
  if (left.patch !== right.patch) return left.patch - right.patch
  if (left.prerelease === right.prerelease) return 0
  if (left.prerelease === null) return 1
  if (right.prerelease === null) return -1
  if (left.prerelease < right.prerelease) return -1
  if (left.prerelease > right.prerelease) return 1
  return 0
}

function compareTo(version, other) {
  const left = parseVersion(version)
  const right = parseVersion(other)
  if (!left || !right) return null
  return compareVersions(left, right)
}

function rangeAndIncludes(part, version) {
  const tokens = part.match(/(<=|>=|<|>|=)?\s*v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/g)
  if (!tokens) return null
  const rebuilt = tokens.join(' ').replace(/\s+/g, ' ')
  if (rebuilt !== part.replace(/\s+/g, ' ')) return null
  for (const token of tokens) {
    const match = /^(<=|>=|<|>|=)?\s*v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(token.trim())
    if (!match) return null
    const operator = match[1] || '='
    const cmp = compareTo(version, match[2])
    if (cmp === null) return null
    const matches =
      (operator === '=' && cmp === 0) ||
      (operator === '<' && cmp < 0) ||
      (operator === '<=' && cmp <= 0) ||
      (operator === '>' && cmp > 0) ||
      (operator === '>=' && cmp >= 0)
    if (!matches) return false
  }
  return true
}

/** True, false, or null when `range` uses syntax this check does not understand. */
function rangeIncludes(range, version) {
  if (typeof range !== 'string' || range.trim() === '') return null
  const parts = range
    .split('||')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  let included = false
  for (const part of parts) {
    const partIncluded = rangeAndIncludes(part, version)
    if (partIncluded === null) return null
    if (partIncluded) included = true
  }
  return included
}

/**
 * True when a stable published version is outside the advisory range.
 * Prereleases are ignored. Null means the versions or the range could not be checked.
 */
function hasStableReleaseOutsideRange(versions, range) {
  if (!Array.isArray(versions)) return null
  let stableCount = 0
  let outside = false
  for (const version of versions) {
    const parsed = typeof version === 'string' ? parseVersion(version) : null
    if (!parsed || parsed.prerelease !== null) continue
    stableCount += 1
    const included = rangeIncludes(range, version)
    if (included === null) return null
    if (!included) outside = true
  }
  if (stableCount === 0) return null
  return outside
}

function isDevOnlyEntry(entry) {
  return entry?.dev === true || entry?.devOptional === true
}

function installedCopies(lockfile, packageName) {
  const packages = lockfile?.packages ?? {}
  const root = `node_modules/${packageName}`
  const suffix = `/node_modules/${packageName}`
  return Object.keys(packages).filter((key) => key === root || key.endsWith(suffix))
}

function copiesAreDevOnly(lockfile, packageName, auditNodes) {
  if (!Array.isArray(auditNodes) || auditNodes.length === 0) return false
  if (auditNodes.some((node) => typeof node !== 'string' || node === '')) return false
  const copies = installedCopies(lockfile, packageName)
  if (copies.length === 0) return false
  const nodes = new Set([...auditNodes, ...copies])
  for (const node of nodes) {
    if (!isDevOnlyEntry(lockfile?.packages?.[node])) return false
  }
  return true
}

function waiverFor(vuln, via, context) {
  const id = advisoryId(via)
  if (!id) return { waived: false, id: null, reason: 'high or critical advisory has no GHSA id' }
  const entry = context.allowlist.find((item) => sameId(item.id, id))
  if (!entry) return { waived: false, id, reason: `${id} is not allowlisted` }
  if (!expiryStillOpen(entry.expires, context.now)) {
    return { waived: false, id, reason: `${entry.id} allowlist entry expired on ${entry.expires}` }
  }
  const packageName = via.name || vuln.name
  if (!copiesAreDevOnly(context.lockfile, packageName, vuln.nodes)) {
    return { waived: false, id, reason: `${entry.id} is reachable from a production dependency` }
  }
  const versions = context.publishedVersions?.[packageName]
  if (!Array.isArray(versions)) {
    return { waived: false, id, reason: `published versions for ${packageName} were not checked` }
  }
  const patched = hasStableReleaseOutsideRange(versions, via.range)
  if (patched === null) {
    return { waived: false, id, reason: `could not compare ${packageName} versions to advisory range ${via.range}` }
  }
  if (patched) {
    return { waived: false, id, reason: `a patched ${packageName} release is available outside ${via.range}` }
  }
  return { waived: true, id: entry.id, reason: entry.reason }
}

function record(list, seen, item) {
  const key = `${item.id ?? ''}|${item.packageName}|${item.reason}`
  if (seen.has(key)) return
  seen.add(key)
  list.push(item)
}

export function evaluateAudit(report, options = {}) {
  const context = {
    now: options.now ?? new Date(),
    allowlist: options.allowlist ?? ALLOWLIST,
    lockfile: options.lockfile ?? { packages: {} },
    publishedVersions: options.publishedVersions ?? {},
  }
  const threshold = rank(AUDIT_LEVEL)
  const vulns = report?.vulnerabilities
  if (!vulns || typeof vulns !== 'object' || Array.isArray(vulns)) {
    return {
      ok: false,
      failures: [
        {
          packageName: '',
          id: null,
          severity: null,
          reason: 'npm audit JSON has no vulnerabilities object',
        },
      ],
      waived: [],
    }
  }

  const failures = []
  const waived = []
  const seenFail = new Set()
  const seenWaive = new Set()
  const memo = new Map()

  function status(name, stack) {
    if (memo.has(name)) return memo.get(name)
    if (stack.has(name)) return 'pending'
    const vuln = vulns[name]
    if (!vuln || typeof vuln !== 'object') return 'none'
    stack.add(name)
    const vias = Array.isArray(vuln.via) ? vuln.via : []
    let sawWaived = false
    let sawBlocking = false
    let sawHighCause = false
    for (const via of vias) {
      if (typeof via === 'string') {
        if (!vulns[via]) {
          sawBlocking = true
          sawHighCause = true
          record(failures, seenFail, {
            packageName: name,
            id: null,
            severity: vuln.severity ?? null,
            reason: `${name} depends on ${via}, which is missing from the audit report`,
          })
          continue
        }
        const child = status(via, stack)
        if (child === 'blocking' || child === 'pending') {
          sawBlocking = true
          sawHighCause = true
        } else if (child === 'waived') {
          sawWaived = true
          sawHighCause = true
        }
        continue
      }
      if (!via || typeof via !== 'object' || rank(via.severity) < threshold) continue
      sawHighCause = true
      const decision = waiverFor(vuln, via, context)
      const packageName = via.name || name
      if (decision.waived) {
        sawWaived = true
        record(waived, seenWaive, {
          packageName,
          id: decision.id,
          severity: via.severity,
          reason: decision.reason,
        })
      } else {
        sawBlocking = true
        record(failures, seenFail, {
          packageName,
          id: decision.id,
          severity: via.severity,
          reason: decision.reason,
        })
      }
    }
    stack.delete(name)

    let result = 'none'
    if (sawBlocking) result = 'blocking'
    else if (rank(vuln.severity) >= threshold && !sawHighCause) {
      result = 'blocking'
      record(failures, seenFail, {
        packageName: name,
        id: null,
        severity: vuln.severity ?? null,
        reason: `${name} is ${vuln.severity} with no advisory detail`,
      })
    } else if (sawWaived) result = 'waived'

    memo.set(name, result)
    return result
  }

  for (const name of Object.keys(vulns)) status(name, new Set())
  return { ok: failures.length === 0, failures, waived }
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function run(args, cwd) {
  const result = spawnSync('npm', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  if (result.error) return { ok: false, error: result.error.message, stdout: '' }
  return {
    ok: true,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function fail(message) {
  console.error(`::error::audit-check: ${message}`)
  return 1
}

function allowlistedPackageNames(report) {
  const names = new Set()
  for (const vuln of Object.values(report.vulnerabilities ?? {})) {
    if (!vuln || typeof vuln !== 'object' || !Array.isArray(vuln.via)) continue
    for (const via of vuln.via) {
      const id = advisoryId(via)
      if (!id || !via.name) continue
      if (ALLOWLIST.some((entry) => sameId(entry.id, id))) names.add(via.name)
    }
  }
  return [...names]
}

function publishedVersions(names, cwd) {
  const versions = {}
  for (const name of names) {
    const viewed = run(['view', name, 'versions', '--json'], cwd)
    if (!viewed.ok || viewed.status !== 0) {
      return { error: `could not list published versions of ${name}` }
    }
    let parsed
    try {
      parsed = JSON.parse(viewed.stdout)
    } catch {
      return { error: `npm view ${name} versions did not return JSON` }
    }
    versions[name] = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)]
  }
  return { versions }
}

function main() {
  const root = repoRoot()
  const audit = run(['audit', '--json', '--audit-level=high'], root)
  if (!audit.ok) return fail(audit.error)
  if (audit.status !== 0 && audit.status !== 1) {
    return fail(`npm audit exited ${audit.status}: ${audit.stderr.trim()}`)
  }
  let report
  try {
    report = JSON.parse(audit.stdout)
  } catch {
    return fail('npm audit did not return JSON')
  }
  if (report?.error) {
    const summary = report.error.summary || report.error.message || 'npm audit failed'
    return fail(summary)
  }

  let lockfile
  try {
    lockfile = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
  } catch {
    return fail('could not read package-lock.json')
  }

  const names = allowlistedPackageNames(report)
  const published = publishedVersions(names, root)
  if (published.error) return fail(published.error)

  const result = evaluateAudit(report, { lockfile, publishedVersions: published.versions })
  for (const item of result.waived) {
    const entry = ALLOWLIST.find((candidate) => sameId(candidate.id, item.id))
    console.log(`audit-check: waived ${item.id} on ${item.packageName} before ${entry?.expires}: ${item.reason}`)
  }
  if (!result.ok) {
    for (const item of result.failures) {
      const label = item.id ?? item.packageName ?? 'audit'
      console.error(`::error::audit-check: ${label}: ${item.reason}`)
    }
    return 1
  }
  console.log('audit-check: no high or critical advisories outside the active allowlist')
  return 0
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (entry === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
