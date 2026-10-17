/**
 * Download the verified tool logos and normalize them to public/logos/{slug}.webp.
 *
 * The source of truth is src/data/logo-sources.csv (Forge's checked list:
 * slug, logo_url, source_page, format, size, status). This script does not
 * scrape homepages. It downloads each status=ok URL once, sanitizes SVG
 * (scripts and event handlers removed) and pads the mark onto a 128px white
 * rounded tile. The mark's long side fills about 80% of that tile. The artwork
 * is not recolored or cropped.
 *
 * status=low_res and status=missing are monogram fallbacks. No file is written.
 * An ok row can also stay a monogram when the artwork is not the product mark
 * (see MONOGRAM_OVERRIDES). A single-colour pinned-tab mark is drawn on a
 * neutral tile so the ink stays visible on a light page and a dark page.
 *
 * Trademark note: all logos and icons are trademarks of their owners. They are
 * used on BestBotFor for identification only and do not imply endorsement.
 *
 * Writes src/data/logo-manifest.json with slug, source URL, and fetched date,
 * plus src/data/logo-slugs.json (slugs only) for the renderer. Pages do not
 * import the manifest.
 *
 *   npm run logos:fetch
 *
 * Downloaded bytes are cached under /tmp/tool-logo-cache. Set LOGO_FETCH_CACHE=0
 * to force a cold fetch.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { toolSeeds } from '../src/data/catalog'
import { LOGO_MANIFEST_PATH, LOGO_PUBLIC_DIR, LOGO_TILE_SIZE, TOOL_LOGO_MARK_FILL } from '../src/lib/logo-source'

const SOURCES_PATH = 'src/data/logo-sources.csv'
const LOGO_SLUGS_PATH = 'src/data/logo-slugs.json'

const SIZE = LOGO_TILE_SIZE
const INNER = Math.round(SIZE * TOOL_LOGO_MARK_FILL)
const RADIUS = 28
const MIN_RASTER = 128
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
]
const CACHE_ROOT = process.env.LOGO_FETCH_CACHE === '0' ? null : path.join('/tmp', 'tool-logo-cache-v2')

const MISSING_SLUGS = ['midjourney'] as const
const LOW_RES_SLUGS = ['clearscope', 'clipdrop', 'jules', 'letsenhance', 'neuronwriter', 'wolfram-alpha'] as const

/**
 * Pass 2 eyeball. The playgroundai GitHub org avatar is a cartoon person in a
 * hoodie. Playground's own mark is a geometric cube, and the site icon is
 * 84px, so this row stays on the monogram.
 */
export const MONOGRAM_OVERRIDES = ['playground'] as const

/** White rounded tile used for every mark except the neutral-tile slugs. */
export const WHITE_TILE_FILL = '#ffffff'

/**
 * Mid gray. A black pinned-tab mark disappears on the dark page color, and a
 * white one disappears on a white tile. This gray keeps either visible, and
 * it shows through a transparent cutout.
 */
export const NEUTRAL_TILE_FILL = '#a8a8b6'

/** Deepgram's safari pinned-tab SVG is one black shape with a cutout waveform. */
export const NEUTRAL_TILE_SLUGS = ['deepgram'] as const

const OK_COUNT = 152
const LOW_RES_COUNT = 6
const MISSING_COUNT = 1

type LogoStatus = 'ok' | 'low_res' | 'missing'

type LogoSource = {
  slug: string
  logoUrl: string
  sourcePage: string
  format: string
  size: string
  status: LogoStatus
}

type ManifestEntry = {
  slug: string
  sourceUrl: string
  fetchedAt: string
}

const fetchedAt = new Date().toISOString().slice(0, 10)

/** GitHub's gray default avatar. avatars.githubusercontent.com/{org} was serving this instead of the org mark. */
const GITHUB_DEFAULT_AVATAR = '2ae73e12cb1e9989929920c4e9da0b02b6f6f8f0bd1944ac9ebfbf6b4dca746b'

async function main(): Promise<void> {
  const only = process.argv.find((arg) => arg.startsWith('--slug='))?.slice('--slug='.length)
  const sources = await readSources()
  assertSources(sources)
  const selected = sources.filter((row) => !only || row.slug === only)
  if (selected.length === 0) throw new Error(only ? `Unknown slug ${only}` : 'No rows in the verified logo list')

  const outputDir = path.join(process.cwd(), LOGO_PUBLIC_DIR)
  await mkdir(outputDir, { recursive: true })
  if (CACHE_ROOT) await mkdir(CACHE_ROOT, { recursive: true })
  const previous = await previousManifest()

  const entries: ManifestEntry[] = []
  const fallbacks: string[] = []
  const failures: string[] = []
  const results = await mapPool(selected, 8, async (row) => {
    if (row.status !== 'ok' || isOverride(MONOGRAM_OVERRIDES, row.slug)) {
      return { slug: row.slug, entry: null as ManifestEntry | null, error: '' }
    }
    try {
      const body = await downloadOnce(row.logoUrl)
      if (createHash('sha256').update(body).digest('hex') === GITHUB_DEFAULT_AVATAR) {
        throw new Error('GitHub returned the default avatar, not the org mark')
      }
      const tileFill = isOverride(NEUTRAL_TILE_SLUGS, row.slug) ? NEUTRAL_TILE_FILL : WHITE_TILE_FILL
      const tile = await normalizeLogo(body, tileFill)
      if (!tile) throw new Error('could not normalize')
      await writeFile(path.join(outputDir, `${row.slug}.webp`), tile)
      const prior = previous.get(row.slug)
      const entryFetchedAt = prior?.sourceUrl === row.logoUrl ? prior.fetchedAt : fetchedAt
      return {
        slug: row.slug,
        entry: { slug: row.slug, sourceUrl: row.logoUrl, fetchedAt: entryFetchedAt } satisfies ManifestEntry,
        error: '',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'download failed'
      return { slug: row.slug, entry: null, error: message }
    }
  })

  for (const result of results) {
    if (result.entry) {
      entries.push(result.entry)
      console.log(`ok ${result.slug} ${result.entry.sourceUrl}`)
    } else if (result.error) {
      failures.push(`${result.slug} (${result.error})`)
      console.log(`failed ${result.slug} ${result.error}`)
    } else {
      fallbacks.push(result.slug)
      console.log(`fallback ${result.slug}`)
    }
  }

  if (failures.length > 0) {
    throw new Error(`Verified logos that did not tile: ${failures.join(', ')}`)
  }

  entries.sort((a, b) => a.slug.localeCompare(b.slug))
  fallbacks.sort((a, b) => a.localeCompare(b))
  if (!only) {
    const kept = new Set(entries.map((entry) => `${entry.slug}.webp`))
    for (const name of await readdir(outputDir)) {
      if (!name.endsWith('.webp')) continue
      if (!kept.has(name)) await rm(path.join(outputDir, name))
    }
    await writeFile(path.join(process.cwd(), LOGO_MANIFEST_PATH), `${JSON.stringify(entries, null, 2)}\n`)
    await writeFile(path.join(process.cwd(), LOGO_SLUGS_PATH), `${JSON.stringify(entries.map((entry) => entry.slug), null, 2)}\n`)
  }
  console.log(`wrote ${entries.length} logos, ${fallbacks.length} monogram fallbacks`)
  console.log(`fallbacks: ${fallbacks.join(', ') || '(none)'}`)
}

export async function readSources(csvPath = path.join(process.cwd(), SOURCES_PATH)): Promise<LogoSource[]> {
  const text = await readFile(csvPath, 'utf8')
  const rows = parseCsv(text)
  const header = rows[0]
  if (!header) throw new Error('Verified logo list is empty')
  const expected = ['slug', 'logo_url', 'source_page', 'format', 'size', 'status']
  if (expected.some((name, index) => header[index] !== name)) {
    throw new Error(`Verified logo list columns must be ${expected.join(', ')}`)
  }
  return rows.slice(1).map((row) => ({
    slug: row[0] ?? '',
    logoUrl: row[1] ?? '',
    sourcePage: row[2] ?? '',
    format: row[3] ?? '',
    size: row[4] ?? '',
    status: row[5] as LogoStatus,
  }))
}

function assertSources(sources: LogoSource[]): void {
  const catalog = new Set(toolSeeds.map((tool) => tool.slug))
  const seen = new Set<string>()
  const counts = { ok: 0, low_res: 0, missing: 0 }
  for (const row of sources) {
    if (!catalog.has(row.slug)) throw new Error(`Verified list has unknown slug ${row.slug}`)
    if (seen.has(row.slug)) throw new Error(`Verified list repeats ${row.slug}`)
    seen.add(row.slug)
    if (row.status !== 'ok' && row.status !== 'low_res' && row.status !== 'missing') {
      throw new Error(`${row.slug} has status ${row.status}`)
    }
    counts[row.status] += 1
    if (row.status === 'ok' && !row.logoUrl.startsWith('https://')) {
      throw new Error(`${row.slug} is ok without an https logo URL`)
    }
    if (row.status === 'missing' && row.logoUrl !== '') throw new Error(`${row.slug} is missing but has a logo URL`)
  }
  for (const slug of catalog) {
    if (!seen.has(slug)) throw new Error(`Verified list is missing catalog slug ${slug}`)
  }
  if (counts.ok !== OK_COUNT || counts.low_res !== LOW_RES_COUNT || counts.missing !== MISSING_COUNT) {
    throw new Error(`Expected ${OK_COUNT} ok, ${LOW_RES_COUNT} low_res, ${MISSING_COUNT} missing; got ${counts.ok}, ${counts.low_res}, ${counts.missing}`)
  }
  const missing = sources.filter((row) => row.status === 'missing').map((row) => row.slug).sort()
  const expectedMissing = [...MISSING_SLUGS].sort()
  if (missing.join() !== expectedMissing.join()) {
    throw new Error(`Missing slugs are ${missing.join(', ')}`)
  }
  const lowRes = sources.filter((row) => row.status === 'low_res').map((row) => row.slug).sort()
  const expectedLowRes = [...LOW_RES_SLUGS].sort()
  if (lowRes.join() !== expectedLowRes.join()) {
    throw new Error(`Low-res slugs are ${lowRes.join(', ')}`)
  }
  for (const slug of [...MONOGRAM_OVERRIDES, ...NEUTRAL_TILE_SLUGS]) {
    const row = sources.find((item) => item.slug === slug)
    if (row?.status !== 'ok') throw new Error(`${slug} is reviewed by hand and must stay an ok row`)
  }
}

function isOverride(slugs: readonly string[], slug: string): boolean {
  return slugs.includes(slug)
}

async function previousManifest(): Promise<Map<string, ManifestEntry>> {
  try {
    const text = await readFile(path.join(process.cwd(), LOGO_MANIFEST_PATH), 'utf8')
    const entries = JSON.parse(text) as ManifestEntry[]
    return new Map(entries.map((entry) => [entry.slug, entry]))
  } catch {
    return new Map()
  }
}

const EXTERNAL_URL = String.raw`(?:https?:|\/\/|javascript:)`

/** Remove scripts, event handlers, foreignObject, and external references before rasterizing. */
export function sanitizeSvg(source: string): string {
  let text = source.replace(/<!DOCTYPE\b[^>]*>/gi, '')
  text = text.replace(/<!ENTITY\b[^>]*>/gi, '')
  text = text.replace(/<\?xml-stylesheet\b[^?]*\?>/gi, '')
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
  text = text.replace(/<script\b[^>]*\/\s*>/gi, '')
  text = text.replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, '')
  text = text.replace(/<foreignObject\b[^>]*\/\s*>/gi, '')
  text = text.replace(/<(?:iframe|embed|object|link)\b[^>]*>[\s\S]*?<\/(?:iframe|embed|object|link)\s*>/gi, '')
  text = text.replace(/<(?:iframe|embed|object|link)\b[^>]*\/\s*>/gi, '')
  text = text.replace(
    new RegExp(
      `<(?:image|use|feImage)\\b[^>]*(?:href|xlink:href|src)\\s*=\\s*(["'])\\s*${EXTERNAL_URL}[^"']*\\1[^>]*(?:\\/>|>[\\s\\S]*?<\\/(?:image|use|feImage)\\s*>)`,
      'gi',
    ),
    '',
  )
  text = text.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  text = text.replace(new RegExp(String.raw`\s(?:href|xlink:href|src)\s*=\s*(["'])\s*` + EXTERNAL_URL + String.raw`[^"']*\1`, 'gi'), '')
  text = text.replace(new RegExp(String.raw`\s(?:href|xlink:href|src)\s*=\s*` + EXTERNAL_URL + String.raw`[^\s>]+`, 'gi'), '')
  text = text.replace(new RegExp(String.raw`url\(\s*(["']?)\s*` + EXTERNAL_URL + String.raw`[^)"']*\1\s*\)`, 'gi'), 'none')
  return text
}

/** Pad the mark onto a 128px rounded tile so its long side is about 80% of the tile. Returns null when the asset is too small, too wide, or unreadable. */
export async function normalizeLogo(input: Buffer, tileFill: string = WHITE_TILE_FILL): Promise<Buffer | null> {
  const prepared = await prepareRaster(input)
  if (!prepared) return null
  const { raster, vector } = prepared
  const meta = await sharp(raster).metadata()
  const sourceWidth = meta.width ?? 0
  const sourceHeight = meta.height ?? 0
  if (!vector && Math.min(sourceWidth, sourceHeight) < MIN_RASTER) return null
  const limited = await sharp(raster)
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .png()
    .toBuffer()
  const limitedMeta = await sharp(limited).metadata()
  const limitedWidth = limitedMeta.width ?? 0
  const limitedHeight = limitedMeta.height ?? 0
  const box = await contentBox(limited)
  if (!box || limitedWidth === 0 || limitedHeight === 0) return null
  const contentAspect = box.width / box.height
  const sourceAspect = sourceWidth / sourceHeight
  const contentSquare = contentAspect >= 0.72 && contentAspect <= 1.4
  const sourceSquare = sourceAspect >= 0.85 && sourceAspect <= 1.18
  const extract = contentSquare ? box : sourceSquare ? { left: 0, top: 0, width: limitedWidth, height: limitedHeight } : null
  if (!extract) return null
  const resized = await sharp(limited)
    .extract(extract)
    .resize(INNER, INNER, {
      fit: 'inside',
      withoutEnlargement: false,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer()
  const resizedMeta = await sharp(resized).metadata()
  const width = resizedMeta.width ?? INNER
  const height = resizedMeta.height ?? INNER
  const left = Math.round((SIZE - width) / 2)
  const top = Math.round((SIZE - height) / 2)
  if (!/^#[0-9a-f]{6}$/i.test(tileFill)) throw new Error('tile fill must be a hex color')
  const tile = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg"><rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="${tileFill}"/></svg>`,
  )
  return sharp(tile)
    .resize(SIZE, SIZE)
    .composite([{ input: resized, left, top }])
    .webp({ lossless: true })
    .toBuffer()
}

async function prepareRaster(input: Buffer): Promise<{ raster: Buffer; vector: boolean } | null> {
  const sniff = sniffFormat(input)
  if (sniff === 'svg') {
    const sanitized = sanitizeSvg(input.toString('utf8'))
    if (!svgIsSafe(sanitized)) return null
    const svg = Buffer.from(sanitized)
    const meta = await sharp(svg, { density: 72 }).metadata()
    const maxSide = Math.max(meta.width ?? MIN_RASTER, meta.height ?? MIN_RASTER)
    const density = Math.min(600, Math.max(144, Math.round((72 * 512) / maxSide)))
    const raster = await sharp(svg, { density }).png().toBuffer()
    return { raster, vector: true }
  }
  if (sniff === 'ico') {
    const embedded = largestIcoImage(input)
    if (!embedded) return null
    try {
      const raster = embedded.png
        ? await sharp(embedded.png).png().toBuffer()
        : await sharp(embedded.data, { raw: { width: embedded.width, height: embedded.height, channels: 4 } }).png().toBuffer()
      return { raster, vector: false }
    } catch {
      return null
    }
  }
  if (sniff === 'unknown') return null
  return { raster: input, vector: false }
}

function sniffFormat(buffer: Buffer): 'svg' | 'png' | 'jpeg' | 'webp' | 'gif' | 'ico' | 'unknown' {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg'
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  if (buffer.length >= 6 && (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a')) return 'gif'
  if (buffer.length >= 4 && buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1) return 'ico'
  const head = buffer.subarray(0, 240).toString('utf8').trimStart().toLowerCase()
  if (head.startsWith('<svg') || head.includes('<svg') || (head.startsWith('<?xml') && buffer.toString('utf8').toLowerCase().includes('<svg'))) return 'svg'
  return 'unknown'
}

function svgIsSafe(text: string): boolean {
  const lower = text.toLowerCase()
  if (lower.includes('<script') || lower.includes('javascript:')) return false
  if (/<!doctype\b|<!entity\b/i.test(text)) return false
  if (/\s+on[a-z]+\s*=/i.test(text)) return false
  if (/<foreignobject|<iframe\b|<embed\b|<object\b/i.test(text)) return false
  if (/\s(?:href|xlink:href|src)\s*=\s*["']?\s*(?:https?:|\/\/)/i.test(text)) return false
  if (/url\(\s*["']?\s*(?:https?:|\/\/)/i.test(text)) return false
  return lower.includes('<svg')
}

type IcoImage = { png: Buffer; data?: undefined; width?: undefined; height?: undefined } | { png?: undefined; data: Buffer; width: number; height: number }

/** Largest embedded PNG, or a decoded bitmap when the icon stores a DIB. */
function largestIcoImage(buffer: Buffer): IcoImage | null {
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return null
  const count = buffer.readUInt16LE(4)
  let best: IcoImage | null = null
  let bestSide = 0
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16
    if (entry + 16 > buffer.length) break
    const width = buffer[entry] || 256
    const height = buffer[entry + 1] || 256
    const bytes = buffer.readUInt32LE(entry + 8)
    const offset = buffer.readUInt32LE(entry + 12)
    if (offset <= 0 || offset + bytes > buffer.length) continue
    const image = buffer.subarray(offset, offset + bytes)
    const isPng = image.length > 8 && image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47
    const decoded: IcoImage | null = isPng ? { png: Buffer.from(image) } : dibToRaw(image)
    const side = Math.min(width, height)
    if (!decoded || side < bestSide) continue
    best = decoded
    bestSide = side
  }
  return best
}

/** Decode an uncompressed ICO bitmap into raw RGBA. */
function dibToRaw(dib: Buffer): { data: Buffer; width: number; height: number } | null {
  if (dib.length < 40 || dib.readUInt32LE(0) < 40) return null
  if (dib.readUInt32LE(16) !== 0) return null
  const headerSize = dib.readUInt32LE(0)
  const width = dib.readInt32LE(4)
  const storedHeight = dib.readInt32LE(8)
  const bits = dib.readUInt16LE(14)
  if (width <= 0 || storedHeight === 0 || width > 4096) return null
  if (bits !== 32 && bits !== 24 && bits !== 8) return null
  const height = storedHeight === width * 2 ? width : Math.abs(storedHeight)
  const colors = dib.readUInt32LE(32)
  const paletteEntries = bits <= 8 ? colors || 1 << bits : colors
  const stride = Math.floor((width * bits + 31) / 32) * 4
  const pixels = headerSize + paletteEntries * 4
  if (pixels + stride * height > dib.length) return null
  const palette = dib.subarray(headerSize, pixels)
  const data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const row = pixels + (height - 1 - y) * stride
    for (let x = 0; x < width; x += 1) {
      const dest = (y * width + x) * 4
      if (bits === 32) {
        const index = row + x * 4
        data[dest] = dib[index + 2] ?? 0
        data[dest + 1] = dib[index + 1] ?? 0
        data[dest + 2] = dib[index] ?? 0
        data[dest + 3] = dib[index + 3] ?? 255
      } else if (bits === 24) {
        const index = row + x * 3
        data[dest] = dib[index + 2] ?? 0
        data[dest + 1] = dib[index + 1] ?? 0
        data[dest + 2] = dib[index] ?? 0
        data[dest + 3] = 255
      } else {
        const index = (dib[row + x] ?? 0) * 4
        data[dest] = palette[index + 2] ?? 0
        data[dest + 1] = palette[index + 1] ?? 0
        data[dest + 2] = palette[index] ?? 0
        data[dest + 3] = 255
      }
    }
  }
  if (bits === 32 && !data.some((value, index) => index % 4 === 3 && value !== 0)) {
    for (let index = 3; index < data.length; index += 4) data[index] = 255
  }
  return { data, width, height }
}

/** Longest side of the non-white mark, divided by the tile side. About 0.8 when the artwork fills the inner box. */
export async function markLongSideFill(input: Buffer): Promise<number | null> {
  const meta = await sharp(input).metadata()
  const side = Math.max(meta.width ?? 0, meta.height ?? 0)
  const box = await contentBox(input)
  if (!box || side === 0) return null
  return Math.max(box.width, box.height) / side
}

/** Bounding box of pixels that are not transparent and not near-white padding. */
async function contentBox(input: Buffer): Promise<{ left: number; top: number; width: number; height: number } | null> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  if (!width || !height || channels < 4) return null
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let darkest = 1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * channels
      const red = data[index] ?? 0
      const green = data[index + 1] ?? 0
      const blue = data[index + 2] ?? 0
      const alpha = data[index + 3] ?? 0
      if (alpha < 16) continue
      if (red > 246 && green > 246 && blue > 246) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
      if (luminance < darkest) darkest = luminance
    }
  }
  if (maxX < minX || maxY < minY) return null
  if (darkest > 0.82) return null
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

async function downloadOnce(url: string): Promise<Buffer> {
  const cached = await readCache(url)
  if (cached) return cached
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 20_000)
      try {
        const response = await fetch(url, {
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'user-agent': USER_AGENTS[attempt % USER_AGENTS.length] ?? USER_AGENTS[0] ?? 'BestBotFor',
            accept: 'image/png,image/svg+xml,image/webp,image/*,*/*;q=0.8',
          },
        })
        if (response.status === 403 || response.status === 429 || response.status >= 500) {
          lastError = new Error(`status ${response.status}`)
          await delay(400 * (attempt + 1))
          continue
        }
        if (!response.ok) throw new Error(`status ${response.status}`)
        if (!response.url.startsWith('https://')) throw new Error('redirect left https')
        const buffer = await readLimited(response, 8_000_000)
        if (sniffFormat(buffer) === 'unknown') throw new Error('response was not an image')
        await writeCache(url, buffer)
        return buffer
      } finally {
        clearTimeout(timer)
      }
    } catch (error) {
      lastError = error
      await delay(400 * (attempt + 1))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('download failed')
}

async function readLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('empty body')
  const chunks: Buffer[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error('response too large')
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 1
        } else quoted = false
      } else cell += char
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      cell = ''
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      continue
    }
    cell += char
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function cachePath(url: string): string | null {
  if (!CACHE_ROOT) return null
  return path.join(CACHE_ROOT, createHash('sha256').update(url).digest('hex'))
}

async function readCache(url: string): Promise<Buffer | null> {
  const file = cachePath(url)
  if (!file || !existsSync(file)) return null
  return readFile(file)
}

async function writeCache(url: string, body: Buffer): Promise<void> {
  const file = cachePath(url)
  if (!file) return
  await writeFile(file, body)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function mapPool<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let index = 0
  async function run(): Promise<void> {
    while (index < items.length) {
      const current = index
      index += 1
      const item = items[current]
      if (item === undefined) continue
      results[current] = await worker(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()))
  return results
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'logo fetch failed')
    process.exit(1)
  })
}
