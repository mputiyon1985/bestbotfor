import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { toolSeeds } from '@/data/catalog'
import manifestJson from '@/data/logo-manifest.json'
import logoSlugsJson from '@/data/logo-slugs.json'
import { LOGO_PUBLIC_DIR, monogramLetter, TOOL_LOGO_MARK_FILL } from '@/lib/logo-source'
import { monogramFontSize, resolveToolLogo, TOOL_LOGO_SIZE } from '@/lib/tool-logo'
import { MONOGRAM_OVERRIDES, NEUTRAL_TILE_FILL, NEUTRAL_TILE_SLUGS, markLongSideFill, normalizeLogo, readSources, sanitizeSvg } from '../../scripts/fetch-tool-logos'

type ManifestEntry = { slug: string; sourceUrl: string; fetchedAt: string }

const manifest = manifestJson as ManifestEntry[]
const MISSING = [
  '1password-for-agents', 'agensh', 'agentgrid', 'agentvalley', 'aider', 'candor', 'clips-by-plastic', 'context-engine', 'corgi', 'deepcell', 'eardub', 'futureproof', 'gamma', 'heal-dev', 'instant-search', 'inyon', 'kimi', 'klaussy-review', 'lexmount', 'linkintel', 'llama-app', 'major', 'midjourney', 'monid', 'monish', 'movo-ai', 'mypip', 'nightcafe', 'ovren', 'papermark', 'plango', 'polylane', 'quillbot', 'sellto-us', 'shogunai', 'sideos', 'specsight', 'sume-api', 'witness', 'yourcast', 'zcad-ai',
]
const LOW_RES = ['clearscope', 'clipdrop', 'cutbay', 'hailuo', 'jules', 'letsenhance', 'neuronwriter', 'tldv', 'wolfram-alpha']
const HOSTED = 186
const monogramOverrides = new Set<string>(MONOGRAM_OVERRIDES)

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
    expect(sources.filter((row) => row.status === 'ok')).toHaveLength(187)
    expect(sources.filter((row) => row.status === 'low_res')).toHaveLength(9)
    const missing = sources.filter((row) => row.status === 'missing').map((row) => row.slug).sort()
    expect(missing).toEqual(MISSING)
    const lowRes = sources.filter((row) => row.status === 'low_res').map((row) => row.slug).sort()
    expect(lowRes).toEqual(LOW_RES)
    expect([...MONOGRAM_OVERRIDES]).toEqual(['playground'])
    expect([...NEUTRAL_TILE_SLUGS]).toEqual(['deepgram'])

    const manifestSlugs = manifest.map((entry) => entry.slug)
    expect(new Set(manifestSlugs).size).toBe(manifest.length)
    expect(logoSlugsJson).toEqual(manifestSlugs)
    expect(manifest).toHaveLength(HOSTED)
    for (const entry of manifest) {
      const row = bySlug.get(entry.slug)
      expect(row?.status).toBe('ok')
      expect(entry.sourceUrl).toBe(row?.logoUrl)
      expect(entry.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const tool = toolSeeds.find((item) => item.slug === entry.slug)
      expect(tool, entry.slug).toBeTruthy()
      if (!tool) continue
      expect(resolveToolLogo(tool.slug, tool.name).kind).toBe('file')
      expect(monogramOverrides.has(entry.slug)).toBe(false)
    }
    for (const tool of toolSeeds) {
      const row = bySlug.get(tool.slug)
      const logo = resolveToolLogo(tool.slug, tool.name)
      const usesFile = row?.status === 'ok' && !monogramOverrides.has(tool.slug)
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

  it('pads a full mark to about 80% of the tile', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#111111"/></svg>'
    const tile = await normalizeLogo(Buffer.from(svg))
    expect(tile).not.toBeNull()
    if (!tile) return
    const fill = await markLongSideFill(tile)
    expect(fill).toBeGreaterThanOrEqual(TOOL_LOGO_MARK_FILL - 0.03)
    expect(fill).toBeLessThanOrEqual(TOOL_LOGO_MARK_FILL + 0.03)

    const saved = await markLongSideFill(readFileSync(path.join(process.cwd(), LOGO_PUBLIC_DIR, 'activepieces.webp')))
    expect(saved).toBeGreaterThanOrEqual(TOOL_LOGO_MARK_FILL - 0.03)
    expect(saved).toBeLessThanOrEqual(TOOL_LOGO_MARK_FILL + 0.03)
    expect(monogramFontSize(TOOL_LOGO_SIZE)).toBe(23)
  })

  it('strips scripts, event handlers, external refs, and foreignObject before tiling', async () => {
    const dirty = [
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="128" height="128" onload="alert(1)">',
      '<script>alert(1)</script>',
      '<foreignObject width="10" height="10"><iframe src="https://evil.example/x"></iframe></foreignObject>',
      '<image href="https://evil.example/a.png" width="10" height="10"/>',
      '<rect width="128" height="128" fill="#111111"/>',
      '<circle cx="64" cy="64" r="40" fill="url(#grad)" style="fill:url(https://evil.example/a.png)"/>',
      '</svg>',
    ].join('')
    const clean = sanitizeSvg(dirty)
    const lower = clean.toLowerCase()
    expect(lower).not.toContain('<script')
    expect(lower).not.toContain('<foreignobject')
    expect(lower).not.toContain('<iframe')
    expect(lower).not.toContain('<!doctype')
    expect(lower).not.toContain('https:')
    expect(lower).not.toContain('javascript:')
    expect(clean).not.toMatch(/\son[a-z]+\s*=/i)
    expect(clean).toContain('<circle')
    expect(clean).toContain('url(#grad)')
    const tile = await normalizeLogo(Buffer.from(dirty))
    expect(tile).not.toBeNull()
    const meta = await sharp(tile!).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.width).toBe(128)
    expect(meta.height).toBe(128)
  })

  it('draws a single-colour mark on the neutral tile and keeps other tiles white', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#000000"/></svg>'
    const neutral = await normalizeLogo(Buffer.from(svg), NEUTRAL_TILE_FILL)
    const white = await normalizeLogo(Buffer.from(svg))
    expect(neutral).not.toBeNull()
    expect(white).not.toBeNull()
    if (!neutral || !white) return
    const neutralEdge = await pixel(neutral, 6, 64)
    const whiteEdge = await pixel(white, 6, 64)
    expect(neutralEdge).toEqual(hexRgb(NEUTRAL_TILE_FILL))
    expect(whiteEdge).toEqual([255, 255, 255, 255])
    const saved = await pixel(readFileSync(path.join(process.cwd(), LOGO_PUBLIC_DIR, 'deepgram.webp')), 6, 64)
    expect(saved).toEqual(hexRgb(NEUTRAL_TILE_FILL))
  })
})

async function pixel(input: Buffer, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const index = (y * info.width + x) * info.channels
  return [data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0, data[index + 3] ?? 0]
}

function hexRgb(hex: string): number[] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255]
}
