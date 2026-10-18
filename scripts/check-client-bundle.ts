import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  adminOnlyChunks,
  CATALOG_CLIENT_FORBIDDEN,
  CLIENT_BUNDLE_FORBIDDEN,
  clientBundleHits,
  manifestCoverageProblems,
  parseClientReferenceManifest,
} from '../src/lib/client-bundle'

const NEXT_ROOT = path.join(process.cwd(), '.next')
const STATIC_ROOT = path.join(NEXT_ROOT, 'static')
const SERVER_APP_ROOT = path.join(NEXT_ROOT, 'server', 'app')
const APP_PATHS_MANIFEST = path.join(NEXT_ROOT, 'server', 'app-paths-manifest.json')

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

  // Chunks only /admin routes load may carry the sponsor catalog (the admin card
  // queue). With no manifests every chunk counts as public, so the scan fails closed.
  const manifests: { route: string; chunks: string[] }[] = []
  try {
    for (const full of await filesIn(SERVER_APP_ROOT)) {
      if (!full.endsWith('_client-reference-manifest.js')) continue
      manifests.push(...parseClientReferenceManifest(await readFile(full, 'utf8')))
    }
  } catch {
    // No server app output: treat every chunk as public.
  }
  // A partial manifest set would make shared chunks look admin-only, so the
  // parsed routes must cover every app route Next built.
  let appPaths: string[] = []
  try {
    appPaths = Object.keys(JSON.parse(await readFile(APP_PATHS_MANIFEST, 'utf8')) as Record<string, string>)
  } catch {
    console.error('No readable .next/server/app-paths-manifest.json. Run the production build before the bundle scan.')
    process.exit(1)
  }
  const coverage = manifestCoverageProblems(
    appPaths,
    manifests.map((entry) => entry.route),
  )
  if (coverage.length > 0) {
    console.error('Client-reference manifests do not cover the app routes, so admin-only chunks cannot be trusted:')
    for (const problem of coverage) console.error(problem)
    process.exit(1)
  }
  const adminOnly = adminOnlyChunks(manifests)

  const hits: string[] = []
  const catalogHits: string[] = []
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
    const chunk = path.relative(NEXT_ROOT, full).split(path.sep).join('/')
    if (full.endsWith('.js') && !adminOnly.has(chunk)) {
      for (const needle of clientBundleHits(text, CATALOG_CLIENT_FORBIDDEN)) {
        catalogHits.push(`${path.relative(process.cwd(), full)} contains ${needle}`)
      }
    }
  }

  if (hits.length > 0) {
    console.error('Client bundle leaked a secret or a Stripe key:')
    for (const hit of hits) console.error(hit)
    process.exit(1)
  }
  if (catalogHits.length > 0) {
    console.error(
      'A non-admin client chunk contains the SPONSOR_OFFERINGS catalog. Client modules must import copy from @/lib/sponsor-form-copy, not @/lib/sponsor-offerings:',
    )
    for (const hit of catalogHits) console.error(hit)
    process.exit(1)
  }
  console.log(
    `Scanned ${files.length} client files. No database or Stripe secrets. No sponsor catalog outside ${adminOnly.size} admin-only chunk(s) (${manifests.length} of ${appPaths.length} routes).`,
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Bundle check failed')
  process.exit(1)
})
