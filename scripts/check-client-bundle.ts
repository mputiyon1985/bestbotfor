import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { CLIENT_BUNDLE_FORBIDDEN, clientBundleHits } from '../src/lib/client-bundle'

const STATIC_ROOT = path.join(process.cwd(), '.next', 'static')

async function filesIn(directory: string): Promise<string[]> {
  const found: string[] = []
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...(await filesIn(full)))
    else found.push(full)
  }
  return found
}

async function main(): Promise<void> {
  let files: string[]
  try {
    files = await filesIn(STATIC_ROOT)
  } catch {
    console.error('No .next/static directory. Run the production build before the bundle scan.')
    process.exit(1)
  }

  const token = process.env.TURSO_AUTH_TOKEN?.trim() ?? ''
  const needles = [...CLIENT_BUNDLE_FORBIDDEN]
  if (token.length >= 20) needles.push(token)

  const hits: string[] = []
  for (const full of files) {
    let text: string
    try {
      text = await readFile(full, 'utf8')
    } catch {
      continue
    }
    for (const needle of clientBundleHits(text, needles)) {
      const label = needle === token ? 'TURSO auth token value' : needle
      hits.push(`${path.relative(process.cwd(), full)} contains ${label}`)
    }
  }

  if (hits.length > 0) {
    console.error('Client bundle leaked a secret or a Stripe key:')
    for (const hit of hits) console.error(hit)
    process.exit(1)
  }
  console.log(`Scanned ${files.length} client files. No database or Stripe secrets.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Bundle check failed')
  process.exit(1)
})
