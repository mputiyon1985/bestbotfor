import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ESLint } from 'eslint'
import {
  adminOnlyChunks,
  CATALOG_CLIENT_FORBIDDEN,
  CLIENT_BUNDLE_FORBIDDEN,
  clientBundleHits,
  isAdminRoute,
  manifestCoverageProblems,
  parseClientReferenceManifest,
  scrubClientBundleText,
} from './client-bundle'
// @ts-expect-error -- plain ESM config module without types
import { isClientModuleSource } from '../../eslint.config.mjs'

const LIVE_PUBLISHABLE = ['pk_', 'live_'].join('')
const CLERK_FORMAT = ['pk_', 'test_', '... or ', 'pk_', 'live_', '...'].join('')
const CLERK_MESSAGE = `The publishableKey passed to Clerk is invalid (key={{key}}, expected format: ${CLERK_FORMAT}).`

describe('client bundle scan', () => {
  it('flags a live publishable key', () => {
    const key = `${LIVE_PUBLISHABLE}51abc`
    expect(clientBundleHits(key, CLIENT_BUNDLE_FORBIDDEN)).toContain(LIVE_PUBLISHABLE)
  })

  it('ignores Clerk’s invalid-key message and still flags a real key beside it', () => {
    expect(scrubClientBundleText(CLERK_MESSAGE)).not.toContain(LIVE_PUBLISHABLE)
    expect(clientBundleHits(CLERK_MESSAGE, CLIENT_BUNDLE_FORBIDDEN)).not.toContain(LIVE_PUBLISHABLE)
    const key = `${LIVE_PUBLISHABLE}51abc`
    expect(clientBundleHits(`${CLERK_MESSAGE}\n${key}`, CLIENT_BUNDLE_FORBIDDEN)).toContain(LIVE_PUBLISHABLE)
    const prefixCheck = `C="${LIVE_PUBLISHABLE}",w="pk_test_"` + `e.startsWith("${LIVE_PUBLISHABLE}")`
    expect(clientBundleHits(prefixCheck, CLIENT_BUNDLE_FORBIDDEN)).not.toContain(LIVE_PUBLISHABLE)
    expect(clientBundleHits(`${prefixCheck}\n${key}`, CLIENT_BUNDLE_FORBIDDEN)).toContain(LIVE_PUBLISHABLE)
  })

  it('flags the Beehiiv API key name', () => {
    expect(CLIENT_BUNDLE_FORBIDDEN).toContain('BEEHIIV_API_KEY')
    expect(clientBundleHits('process.env.BEEHIIV_API_KEY', CLIENT_BUNDLE_FORBIDDEN)).toContain('BEEHIIV_API_KEY')
  })

  it('still flags secret and live secret prefixes', () => {
    expect(clientBundleHits('sk_' + 'live_51abc', CLIENT_BUNDLE_FORBIDDEN)).toContain('sk_' + 'live_')
    expect(clientBundleHits('whsec_abc', CLIENT_BUNDLE_FORBIDDEN)).toContain('whsec_')
  })
})

describe('sponsor catalog guard', () => {
  const manifest = (route: string, chunks: string[]) =>
    `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\nglobalThis.__RSC_MANIFEST[${JSON.stringify(route)}] = ${JSON.stringify({
      clientModules: Object.fromEntries(chunks.map((chunk, index) => [`m${index}`, { id: index, chunks: [`/_next/${chunk}`] }])),
    })};`

  it('flags the minified priceEnv property and Price env names', () => {
    const catalog = 'let t=[{id:"placement_weekly",priceEnv:"STRIPE_PRICE_PLACEMENT_WEEKLY",unitAmount:9900}]'
    expect(clientBundleHits(catalog, CATALOG_CLIENT_FORBIDDEN)).toEqual(['priceEnv:', 'STRIPE_PRICE_'])
    expect(clientBundleHits('"Checkout for this slot is not configured yet."', CATALOG_CLIENT_FORBIDDEN)).toEqual([])
  })

  it('reads route keys and chunk paths from a client-reference manifest', () => {
    expect(parseClientReferenceManifest(manifest('/sponsor/page', ['static/chunks/a.js', 'static/chunks/b.js', 'static/chunks/a.js']))).toEqual([
      { route: '/sponsor/page', chunks: ['static/chunks/a.js', 'static/chunks/b.js'] },
    ])
    expect(parseClientReferenceManifest('')).toEqual([])
  })

  it('treats only chunks that no public route loads as admin-only', () => {
    expect(isAdminRoute('/admin/sponsors/page')).toBe(true)
    expect(isAdminRoute('/admin')).toBe(true)
    expect(isAdminRoute('/administrator/page')).toBe(false)
    expect(isAdminRoute('/sponsor/page')).toBe(false)
    const manifests = [
      ...parseClientReferenceManifest(manifest('/admin/sponsors/page', ['static/chunks/shared.js', 'static/chunks/queue.js'])),
      ...parseClientReferenceManifest(manifest('/sponsor/page', ['static/chunks/shared.js', 'static/chunks/form.js'])),
    ]
    expect([...adminOnlyChunks(manifests)]).toEqual(['static/chunks/queue.js'])
    expect(adminOnlyChunks([]).size).toBe(0)
  })

  it('lint rejects a client module importing @/lib/sponsor-offerings, except the admin card queue', async () => {
    const eslint = new ESLint({ cwd: process.cwd() })
    const lint = async (file: string, text: string) => {
      const [result] = await eslint.lintText(text, { filePath: path.join(process.cwd(), file) })
      return (result?.messages ?? []).filter((message) => message.ruleId === '@typescript-eslint/no-restricted-imports')
    }
    const form = readFileSync(path.join(process.cwd(), 'src/components/sponsor-form.tsx'), 'utf8')
    expect(form).toContain("from '@/lib/sponsor-form-copy'")
    expect(await lint('src/components/sponsor-form.tsx', form)).toEqual([])
    const mutant = form.replace("from '@/lib/sponsor-form-copy'", "from '@/lib/sponsor-offerings'")
    expect(await lint('src/components/sponsor-form.tsx', mutant)).toHaveLength(1)
    const relative = form.replace("from '@/lib/sponsor-form-copy'", "from '../lib/sponsor-offerings'")
    expect(await lint('src/components/sponsor-form.tsx', relative)).toHaveLength(1)
    const typeOnly = `${form}\nexport type { SponsorOffering } from '@/lib/sponsor-offerings'\n`
    expect(await lint('src/components/sponsor-form.tsx', typeOnly)).toEqual([])
    const copy = readFileSync(path.join(process.cwd(), 'src/lib/sponsor-form-copy.ts'), 'utf8')
    expect(await lint('src/lib/sponsor-form-copy.ts', `import { SPONSOR_OFFERINGS } from './sponsor-offerings'\n${copy}\nvoid SPONSOR_OFFERINGS\n`)).toHaveLength(1)
    const queue = readFileSync(path.join(process.cwd(), 'src/components/sponsor-card-queue.tsx'), 'utf8')
    expect(queue).toContain("from '@/lib/sponsor-offerings'")
    expect(await lint('src/components/sponsor-card-queue.tsx', queue)).toEqual([])
  }, 60_000)
})

describe('catalog guard hardening', () => {
  it('detects a use client directive after leading comments', () => {
    const detect = isClientModuleSource as (text: string) => boolean
    expect(detect("'use client'\nexport {}")).toBe(true)
    expect(detect('"use client";\n')).toBe(true)
    expect(detect("// header\n// more\n'use client'\n")).toBe(true)
    expect(detect("/** doc\n * block */\n'use client'\n")).toBe(true)
    expect(detect("\uFEFF/* a */ // b\n\n  /* c */\n'use client'\n")).toBe(true)
    expect(detect("import x from 'y'\n'use client'\n")).toBe(false)
    expect(detect("// 'use client'\nexport {}")).toBe(false)
    expect(detect("export const a = 'use client'\n")).toBe(false)
  })

  it('detects a use client directive after a #! line and other string directives', () => {
    const detect = isClientModuleSource as (text: string) => boolean
    expect(detect("#!/usr/bin/env node\n'use client'\n")).toBe(true)
    expect(detect("'use strict'\n'use client'\n")).toBe(true)
    expect(detect("'use strict'; \"use client\"")).toBe(true)
    expect(detect("\uFEFF#!/usr/bin/env node\n// a\n'use strict' // b\n/* c */ 'use client'\n")).toBe(true)
    expect(detect("'use strict'\nexport {}\n'use client'\n")).toBe(false)
    expect(detect("'abc'.length\n'use client'\n")).toBe(false)
    expect(detect("'use client'.length\n")).toBe(false)
    expect(detect("'use strict' + 'use client'\n")).toBe(false)
    expect(detect("#!/usr/bin/env node\nexport {}\n")).toBe(false)
  })

  it('lint flags real src/ client fixtures whose directive is not on the first line', () => {
    // Real files under src/, so the test goes through clientModules() and the
    // CLIENT_MODULES file list that eslint.config.mjs builds when it loads.
    const dir = path.join(process.cwd(), 'src', `.lint-fixtures-${process.pid}-${Date.now()}`)
    const relative = path.relative(process.cwd(), dir).split(path.sep).join('/')
    const body = "import { SPONSOR_OFFERINGS } from '@/lib/sponsor-offerings'\n\nexport const ids = SPONSOR_OFFERINGS.map((offering) => offering.id)\n"
    const fixtures: Record<string, { text: string; flagged: boolean }> = {
      'comment-first.ts': { text: `// A client module.\n/** Docs. */\n'use client'\n\n${body}`, flagged: true },
      'use-strict-first.ts': { text: `'use strict'\n'use client'\n\n${body}`, flagged: true },
      'shebang-first.ts': { text: `#!/usr/bin/env node\n'use client'\n\n${body}`, flagged: true },
      'server-module.ts': { text: `// Not a client module.\n${body}`, flagged: false },
    }
    mkdirSync(dir, { recursive: true })
    try {
      for (const [name, fixture] of Object.entries(fixtures)) writeFileSync(path.join(dir, name), fixture.text)
      const run = spawnSync(
        process.execPath,
        [path.join(process.cwd(), 'node_modules', 'eslint', 'bin', 'eslint.js'), '--no-cache', '--format', 'json', relative],
        { cwd: process.cwd(), encoding: 'utf8' },
      )
      const results = JSON.parse(run.stdout || '[]') as { filePath: string; messages: { ruleId: string | null }[] }[]
      for (const [name, fixture] of Object.entries(fixtures)) {
        const result = results.find((entry) => path.basename(entry.filePath) === name)
        expect(result, name).toBeDefined()
        const restricted = (result?.messages ?? []).filter((message) => message.ruleId === '@typescript-eslint/no-restricted-imports')
        expect(restricted.length, name).toBe(fixture.flagged ? 1 : 0)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)

  it('fails when manifests miss app routes or no public route was parsed', () => {
    const appPaths = ['/sponsor/page', '/admin/sponsors/page', '/api/og/route']
    expect(manifestCoverageProblems(appPaths, appPaths)).toEqual([])
    const partial = manifestCoverageProblems(appPaths, ['/admin/sponsors/page', '/api/og/route'])
    expect(partial.join('\n')).toContain('fewer than the 3 app routes')
    expect(partial.join('\n')).toContain('/sponsor/page')
    expect(manifestCoverageProblems(['/admin/page'], ['/admin/page'])).toEqual(['no non-admin route was parsed'])
    expect(manifestCoverageProblems([], [])).toEqual(['app-paths-manifest.json lists no app routes', 'no non-admin route was parsed'])
  })
})
