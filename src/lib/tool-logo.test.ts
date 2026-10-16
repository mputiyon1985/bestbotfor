import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { toolSeeds } from '@/data/catalog'
import manifestJson from '@/data/logo-manifest.json'
import logoSlugsJson from '@/data/logo-slugs.json'
import { LOGO_PUBLIC_DIR, monogramLetter } from '@/lib/logo-source'
import { resolveToolLogo, TOOL_LOGO_SIZE } from '@/lib/tool-logo'
import { normalizeLogo, readSources, sanitizeSvg } from '../../scripts/fetch-tool-logos'

type ManifestEntry = { slug: string; sourceUrl: string; fetchedAt: string }

const manifest = manifestJson as ManifestEntry[]
const MISSING = ['chatgpt', 'jules', 'leonardo-ai', 'midjourney', 'openai-codex', 'replit', 'sunsama']

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

  it('follows the verified list and keeps the manifest off the page', async () => {
    const sources = await readSources()
    const bySlug = new Map(sources.map((row) => [row.slug, row]))
    expect(sources).toHaveLength(toolSeeds.length)
    expect(sources.filter((row) => row.status === 'ok')).toHaveLength(126)
    expect(sources.filter((row) => row.status === 'low_res')).toHaveLength(26)
    const missing = sources.filter((row) => row.status === 'missing').map((row) => row.slug).sort()
    expect(missing).toEqual(MISSING)

    const manifestSlugs = manifest.map((entry) => entry.slug)
    expect(new Set(manifestSlugs).size).toBe(manifest.length)
    expect(logoSlugsJson).toEqual(manifestSlugs)
    expect(manifest).toHaveLength(126)
    for (const entry of manifest) {
      const row = bySlug.get(entry.slug)
      expect(row?.status).toBe('ok')
      expect(entry.sourceUrl).toBe(row?.logoUrl)
      expect(entry.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const tool = toolSeeds.find((item) => item.slug === entry.slug)
      expect(tool, entry.slug).toBeTruthy()
      if (!tool) continue
      expect(resolveToolLogo(tool.slug, tool.name).kind).toBe('file')
    }
    for (const tool of toolSeeds) {
      const row = bySlug.get(tool.slug)
      const logo = resolveToolLogo(tool.slug, tool.name)
      const usesFile = row?.status === 'ok'
      expect(logo.kind === 'file').toBe(usesFile)
      expect(manifestSlugs.includes(tool.slug)).toBe(usesFile)
    }

    const disclosure = readFileSync(path.join(process.cwd(), 'src/app/disclosure/page.tsx'), 'utf8')
    expect(disclosure).toContain('identification only')

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

  it('strips scripts and event handlers from an svg before tiling', async () => {
    const dirty = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" onload="alert(1)"><script>alert(1)</script><circle cx="64" cy="64" r="40" fill="#111111"/></svg>'
    const clean = sanitizeSvg(dirty)
    expect(clean.toLowerCase()).not.toContain('<script')
    expect(clean).not.toMatch(/\son[a-z]+\s*=/i)
    expect(clean).toContain('<circle')
    const tile = await normalizeLogo(Buffer.from(dirty))
    expect(tile).not.toBeNull()
    const meta = await sharp(tile!).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.width).toBe(128)
    expect(meta.height).toBe(128)
  })
})
