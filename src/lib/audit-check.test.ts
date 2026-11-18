import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALLOWLIST, AUDIT_LEVEL, evaluateAudit } from '../../scripts/audit-check.mjs'

type Vuln = {
  name: string
  severity: string
  via: Array<string | { name: string; url?: string; severity: string; range?: string; title?: string; source?: number; dependency?: string }>
  effects?: string[]
  nodes: string[]
  fixAvailable?: unknown
}

type AuditReport = { vulnerabilities: Record<string, Vuln> }

type Lockfile = {
  packages: Record<string, { dev?: boolean; devOptional?: boolean; version?: string }>
}

const NODES = [
  'node_modules/tinyglobby/node_modules/picomatch',
  'node_modules/vite/node_modules/picomatch',
  'node_modules/vitest/node_modules/picomatch',
]

const BEFORE = new Date('2026-11-18T12:00:00.000Z')
const ON_EXPIRY = new Date('2026-12-01T00:00:00.000Z')
const VULNERABLE_VERSIONS = ['2.3.2', '3.0.2', '4.0.6', '4.0.7', '4.0.8-rc.1']

function devLock(extra: Lockfile['packages'] = {}): Lockfile {
  const packages: Lockfile['packages'] = {}
  for (const node of NODES) packages[node] = { dev: true, version: '4.0.7' }
  packages['node_modules/vitest'] = { dev: true }
  packages['node_modules/vite'] = { dev: true }
  packages['node_modules/tinyglobby'] = { dev: true }
  packages['node_modules/tinyglobby/node_modules/fdir'] = { dev: true }
  packages['node_modules/@typescript-eslint/typescript-estree'] = { dev: true }
  packages['node_modules/minimatch'] = { dev: true }
  return { packages: { ...packages, ...extra } }
}

function advisory(id: string, severity: string, range = '<=4.0.7') {
  return {
    source: 1247710,
    name: 'picomatch',
    dependency: 'picomatch',
    title: 'picomatch vulnerable to ReDoS through single-branch repeated extglobs',
    url: `https://github.com/advisories/${id}`,
    severity,
    range,
  }
}

function picomatchReport(id = 'GHSA-fc5q-39xc-vjpf'): AuditReport {
  return {
    vulnerabilities: {
      picomatch: {
        name: 'picomatch',
        severity: 'high',
        via: [advisory(id, 'high')],
        effects: ['fdir', 'tinyglobby', 'vite', 'vitest'],
        nodes: [...NODES],
        fixAvailable: { name: 'vitest', version: '3.1.4', isSemVerMajor: true },
      },
      fdir: {
        name: 'fdir',
        severity: 'high',
        via: ['picomatch'],
        nodes: ['node_modules/tinyglobby/node_modules/fdir'],
        fixAvailable: true,
      },
      tinyglobby: {
        name: 'tinyglobby',
        severity: 'high',
        via: ['fdir', 'picomatch'],
        nodes: ['node_modules/tinyglobby'],
        fixAvailable: { name: 'vitest', version: '3.1.4', isSemVerMajor: true },
      },
      vite: {
        name: 'vite',
        severity: 'high',
        via: ['picomatch', 'tinyglobby'],
        nodes: ['node_modules/vite'],
        fixAvailable: { name: 'vitest', version: '3.1.4', isSemVerMajor: true },
      },
      vitest: {
        name: 'vitest',
        severity: 'high',
        via: ['picomatch', 'tinyglobby', 'vite'],
        nodes: ['node_modules/vitest'],
        fixAvailable: { name: 'vitest', version: '3.1.4', isSemVerMajor: true },
      },
      minimatch: {
        name: 'minimatch',
        severity: 'moderate',
        via: [
          {
            name: 'minimatch',
            url: 'https://github.com/advisories/GHSA-g3hv-75wg-m249',
            severity: 'moderate',
            range: '>=7.0.0 <11.0.1',
            title: 'minimatch',
          },
        ],
        nodes: ['node_modules/minimatch'],
      },
      '@typescript-eslint/typescript-estree': {
        name: '@typescript-eslint/typescript-estree',
        severity: 'high',
        via: ['minimatch', 'tinyglobby'],
        nodes: ['node_modules/@typescript-eslint/typescript-estree'],
      },
    },
  }
}

function evaluate(
  report: AuditReport,
  options: { now?: Date; lockfile?: Lockfile; publishedVersions?: Record<string, string[]>; omitDevOutput?: string } = {},
) {
  return evaluateAudit(report, {
    now: BEFORE,
    lockfile: devLock(),
    publishedVersions: { picomatch: VULNERABLE_VERSIONS },
    omitDevOutput: '{"vulnerabilities":{}}',
    ...options,
  })
}

describe('audit allowlist', () => {
  it('keeps a single high-level exception for the picomatch advisory', () => {
    expect(AUDIT_LEVEL).toBe('high')
    expect(ALLOWLIST).toEqual([
      {
        id: 'GHSA-fc5q-39xc-vjpf',
        expires: '2026-12-01',
        reason: expect.stringContaining('picomatch'),
      },
    ])
  })

  it('passes an allowlisted dev-only advisory before it expires', () => {
    const result = evaluate(picomatchReport())
    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.waived.map((item) => item.id)).toEqual(['GHSA-fc5q-39xc-vjpf'])
  })

  it('fails an allowlisted advisory on its expiry date', () => {
    const result = evaluate(picomatchReport(), { now: ON_EXPIRY })
    expect(result.ok).toBe(false)
    expect(result.waived).toEqual([])
    expect(result.failures.map((item) => item.reason).join('\n')).toContain('expired on 2026-12-01')
  })

  it('fails any other high or critical advisory', () => {
    const high = picomatchReport()
    high.vulnerabilities.leftpad = {
      name: 'leftpad',
      severity: 'high',
      via: [
        {
          name: 'leftpad',
          url: 'https://github.com/advisories/GHSA-1111-2222-3333',
          severity: 'high',
          range: '<1.0.0',
          title: 'other high',
        },
      ],
      nodes: ['node_modules/leftpad'],
    }
    const highResult = evaluate(high, { lockfile: devLock({ 'node_modules/leftpad': { dev: true } }) })
    expect(highResult.ok).toBe(false)
    expect(highResult.failures.map((item) => item.id)).toContain('GHSA-1111-2222-3333')
    expect(highResult.waived.map((item) => item.id)).toEqual(['GHSA-fc5q-39xc-vjpf'])

    const critical = {
      vulnerabilities: {
        other: {
          name: 'other',
          severity: 'critical',
          via: [
            {
              name: 'other',
              url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
              severity: 'critical',
              range: '<2.0.0',
              title: 'other critical',
            },
          ],
          nodes: ['node_modules/other'],
        },
      },
    }
    const criticalResult = evaluate(critical, {
      lockfile: devLock({ 'node_modules/other': { dev: true } }),
      publishedVersions: { other: ['1.0.0'] },
    })
    expect(criticalResult.ok).toBe(false)
    expect(criticalResult.failures.map((item) => item.id)).toContain('GHSA-aaaa-bbbb-cccc')
  })

  it('fails an allowlisted advisory that a production dependency can reach', () => {
    const packages = devLock().packages
    const prodCopy = NODES[0]
    if (prodCopy === undefined) throw new Error('picomatch node missing')
    packages[prodCopy] = { version: '4.0.7' }
    const result = evaluate(picomatchReport(), { lockfile: { packages } })
    expect(result.ok).toBe(false)
    expect(result.waived).toEqual([])
    expect(result.failures.map((item) => item.reason).join('\n')).toContain('reachable from a production dependency')
  })

  it('does not waive a devOptional picomatch copy', () => {
    const packages = devLock().packages
    const optionalCopy = NODES[0]
    if (optionalCopy === undefined) throw new Error('picomatch node missing')
    packages[optionalCopy] = { devOptional: true, version: '4.0.7' }
    const result = evaluate(picomatchReport(), { lockfile: { packages } })
    expect(result.ok).toBe(false)
    expect(result.waived).toEqual([])
    expect(result.failures.map((item) => item.reason).join('\n')).toContain('reachable from a production dependency')
  })

  it('does not waive an advisory id that only extends the allowlisted id', () => {
    for (const id of ['GHSA-fc5q-39xc-vjpfX', 'GHSA-fc5q-39xc-vjpf-extra']) {
      const result = evaluate(picomatchReport(id))
      expect(result.ok).toBe(false)
      expect(result.waived).toEqual([])
      expect(result.failures.some((item) => item.id?.toLowerCase() === 'ghsa-fc5q-39xc-vjpf')).toBe(false)
    }
  })

  it('voids the waiver when the production audit output contains the advisory id', () => {
    const present = evaluate(picomatchReport(), {
      omitDevOutput: '{"vulnerabilities":{"picomatch":{"via":[{"url":"https://github.com/advisories/GHSA-fc5q-39xc-vjpf"}]}}}',
    })
    expect(present.ok).toBe(false)
    expect(present.waived).toEqual([])
    expect(present.failures.map((item) => item.reason).join('\n')).toContain('appears in npm audit --omit=dev output')

    const longerIds = evaluate(picomatchReport(), {
      omitDevOutput:
        '{"url":"https://github.com/advisories/GHSA-fc5q-39xc-vjpf-extra"} https://github.com/advisories/GHSA-fc5q-39xc-vjpfX',
    })
    expect(longerIds.ok).toBe(true)
    expect(longerIds.waived.map((item) => item.id)).toEqual(['GHSA-fc5q-39xc-vjpf'])
  })

  it('fails the allowlisted advisory once a patched stable release exists', () => {
    const result = evaluate(picomatchReport(), {
      publishedVersions: { picomatch: [...VULNERABLE_VERSIONS, '4.0.8'] },
    })
    expect(result.ok).toBe(false)
    expect(result.failures.map((item) => item.reason).join('\n')).toContain('patched picomatch release is available outside <=4.0.7')
  })

  it('leaves moderate advisories below the high audit level', () => {
    const result = evaluate({
      vulnerabilities: {
        minimatch: {
          name: 'minimatch',
          severity: 'moderate',
          via: [
            {
              name: 'minimatch',
              url: 'https://github.com/advisories/GHSA-g3hv-75wg-m249',
              severity: 'moderate',
              range: '>=7.0.0 <11.0.1',
              title: 'minimatch',
            },
          ],
          nodes: ['node_modules/minimatch'],
        },
      },
    })
    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
  })

  it('matches the installed picomatch copies, all of which are dev dependencies', () => {
    const lock = JSON.parse(readFileSync(path.join(process.cwd(), 'package-lock.json'), 'utf8')) as {
      packages: Record<string, { dev?: boolean; devOptional?: boolean; version?: string }>
    }
    const copies = Object.keys(lock.packages).filter(
      (key) => key === 'node_modules/picomatch' || key.endsWith('/node_modules/picomatch'),
    )
    expect(copies.sort()).toEqual([...NODES].sort())
    for (const copy of copies) {
      expect(lock.packages[copy]?.dev).toBe(true)
      expect(lock.packages[copy]?.version).toBe('4.0.7')
    }
    const result = evaluate(picomatchReport(), { lockfile: lock })
    expect(result.ok).toBe(true)
  })

  it('wires the check job through the script and leaves the Lighthouse step in place', () => {
    const workflow = readFileSync(path.join(process.cwd(), '.github/workflows/ci.yml'), 'utf8')
    const script = readFileSync(path.join(process.cwd(), 'scripts/audit-check.mjs'), 'utf8')
    const runbook = readFileSync(path.join(process.cwd(), 'docs/runbooks/ci-audit.md'), 'utf8')
    const changelog = readFileSync(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8')
    expect(workflow).toContain('npm run check:audit')
    expect(workflow).toContain('bash scripts/ci-lighthouse.sh')
    expect(script).toContain("'--audit-level=high'")
    expect(script).toContain("'--omit=dev'")
    expect(script).toContain("'--prefer-online'")
    expect(script).toContain('return entry?.dev === true')
    expect(script).toContain("id: 'GHSA-fc5q-39xc-vjpf'")
    expect(script).toContain("expires: '2026-12-01'")
    expect(runbook).toContain('GHSA-fc5q-39xc-vjpf')
    expect(runbook).toContain('2026-12-01')
    expect(runbook).toContain('`dev: true`')
    expect(runbook).toContain('`devOptional` is not dev-only')
    expect(runbook).toContain('npm audit --omit=dev --json')
    expect(changelog).toContain('GHSA-fc5q-39xc-vjpf')
    expect(changelog).toContain('`devOptional` is not dev-only')
    const auditStep = workflow.slice(workflow.indexOf('- name: Audit'), workflow.indexOf('- run: npm run lint'))
    expect(auditStep).toContain('npm run check:audit')
    expect(auditStep).not.toContain('npm audit')
  })
})
