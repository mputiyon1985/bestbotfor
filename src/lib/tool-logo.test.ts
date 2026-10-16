import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { toolSeeds } from '@/data/catalog'
import manifestJson from '@/data/logo-manifest.json'
import logoSlugsJson from '@/data/logo-slugs.json'
import { isToolSiteUrl, LOGO_PUBLIC_DIR, monogramLetter } from '@/lib/logo-source'
import { resolveToolLogo, TOOL_LOGO_SIZE } from '@/lib/tool-logo'

type ManifestEntry = { slug: string; sourceUrl: string; fetchedAt: string }

const manifest = manifestJson as ManifestEntry[]

function sourceFiles(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...sourceFiles(full))
    else if (/\.(ts|tsx)$/.test(entry.name)) found.push(full)
  }
  return found
}

describe('tool logos', () => {
  it('resolves every catalog slug to a local file or the monogram', () => {
    const files = new Set(
      readdirSync(path.join(process.cwd(), LOGO_PUBLIC_DIR))
        .filter((name) => name.endsWith('.webp'))
        .map((name) => name.slice(0, -'.webp'.length)),
    )
    expect(toolSeeds.length).toBeGreaterThan(0)
    for (const tool of toolSeeds) {
      const logo = resolveToolLogo(tool.slug, tool.name)
      expect(logo.alt).toBe(`${tool.name} logo`)
      expect(logo.width).toBe(TOOL_LOGO_SIZE)
      expect(logo.height).toBe(TOOL_LOGO_SIZE)
      if (logo.kind === 'file') {
        expect(logo.src).toBe(`/logos/${tool.slug}.webp`)
        expect(logo.src.startsWith('https://')).toBe(false)
        expect(logo.src.startsWith('http://')).toBe(false)
        expect(files.has(tool.slug)).toBe(true)
      } else {
        expect(logo.letter).toBe(monogramLetter(tool.name))
        expect(files.has(tool.slug)).toBe(false)
      }
    }
    const resolved = new Set(toolSeeds.map((tool) => tool.slug))
    for (const slug of files) expect(resolved.has(slug)).toBe(true)
  })

  it('records own-site sources in a manifest that pages do not import', () => {
    const bySlug = new Map(toolSeeds.map((tool) => [tool.slug, tool]))
    const manifestSlugs = manifest.map((entry) => entry.slug)
    expect(new Set(manifestSlugs).size).toBe(manifest.length)
    expect(logoSlugsJson).toEqual(manifestSlugs)
    for (const entry of manifest) {
      const tool = bySlug.get(entry.slug)
      expect(tool, entry.slug).toBeTruthy()
      if (!tool) continue
      expect(entry.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.sourceUrl.startsWith('https://')).toBe(true)
      expect(isToolSiteUrl(entry.sourceUrl, tool.url, tool.allowedHosts)).toBe(true)
      const logo = resolveToolLogo(tool.slug, tool.name)
      expect(logo.kind).toBe('file')
    }
    for (const tool of toolSeeds) {
      const logo = resolveToolLogo(tool.slug, tool.name)
      expect(manifestSlugs.includes(tool.slug)).toBe(logo.kind === 'file')
    }

    const roots = ['src/app', 'src/components', 'src/lib'].map((dir) => path.join(process.cwd(), dir))
    const rendered = roots.flatMap((dir) => sourceFiles(dir)).filter((file) => !file.endsWith('tool-logo.test.ts') && !file.endsWith(`${path.sep}logo-source.ts`))
    for (const file of rendered) {
      const text = readFileSync(file, 'utf8')
      expect(text.includes('logo-manifest'), path.relative(process.cwd(), file)).toBe(false)
    }
  })

  it('normalizes every saved tile to a square 128 webp', async () => {
    const directory = path.join(process.cwd(), LOGO_PUBLIC_DIR)
    const names = readdirSync(directory).filter((name) => name.endsWith('.webp'))
    expect(names.length).toBe(manifest.length)
    for (const name of names) {
      const meta = await sharp(path.join(directory, name)).metadata()
      expect(meta.format).toBe('webp')
      expect(meta.width).toBe(128)
      expect(meta.height).toBe(128)
    }
  })
})
