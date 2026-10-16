import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const NEEDLES = ['sk_', 'rk_', 'pk_'].map((prefix) => prefix + 'live_')
const LIVE_OPT_IN = /STRIPE_ALLOW_LIVE\s*=(?!=)\s*['"]?true\b/
const WEBHOOK_SECRET = /whsec_[A-Za-z0-9]{24,}/

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.next',
  'data',
  'coverage',
  'playwright-report',
  'test-results',
])

const SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.db',
])

export async function findLiveStripeKeys(root: string): Promise<string[]> {
  const hits: string[] = []

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      if (!entry.isFile()) continue
      const extension = path.extname(entry.name).toLowerCase()
      if (SKIP_EXTENSIONS.has(extension)) continue
      let text = ''
      try {
        text = await readFile(full, 'utf8')
      } catch {
        continue
      }
      if (NEEDLES.some((needle) => text.includes(needle))) hits.push(full)
      if (LIVE_OPT_IN.test(text) || WEBHOOK_SECRET.test(text)) hits.push(full)
    }
  }

  await walk(root)
  return hits
}
