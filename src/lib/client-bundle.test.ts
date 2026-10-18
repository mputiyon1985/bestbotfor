import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ESLint } from 'eslint'
import {
  adminOnlyChunks,
  CATALOG_CLIENT_FORBIDDEN,
  CLIENT_BUNDLE_FORBIDDEN,
  clientBundleHits,
  isAdminRoute,
  parseClientReferenceManifest,
  scrubClientBundleText,
} from './client-bundle'

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
