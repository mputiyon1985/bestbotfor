/**
 * Fetch official tool logos and normalize them to public/logos/{slug}.webp.
 *
 * Each asset comes from that tool's own site: apple-touch-icon, favicon,
 * web-manifest icons, or a same-site press/brand page. Square SVG is preferred,
 * then a raster of at least 128px. Third-party logo CDNs are rejected.
 * The mark is padded onto a white rounded tile. It is not recolored or cropped.
 *
 * Writes src/data/logo-manifest.json with slug, source URL, and fetched date,
 * plus src/data/logo-slugs.json (slugs only) for the renderer.
 * Tools without a usable logo are omitted; the site draws a monogram instead.
 *
 *   npm run logos:fetch
 *
 * Downloaded bytes are cached under /tmp/tool-logo-cache. Set LOGO_FETCH_CACHE=0
 * to force a cold fetch.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { toolSeeds } from '../src/data/catalog'
import { isToolSiteUrl, LOGO_MANIFEST_PATH, LOGO_PUBLIC_DIR } from '../src/lib/logo-source'

const LOGO_SLUGS_PATH = 'src/data/logo-slugs.json'

const SIZE = 128
const PADDING = 24
const INNER = SIZE - PADDING * 2
const RADIUS = 28
const MIN_RASTER = 128
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const CACHE_ROOT = process.env.LOGO_FETCH_CACHE === '0' ? null : path.join('/tmp', 'tool-logo-cache')

type ManifestEntry = {
  slug: string
  sourceUrl: string
  fetchedAt: string
}

type Candidate = {
  url: string
  hint: number
  inline?: Buffer
}

type ToolResult = {
  slug: string
  entry: ManifestEntry | null
  reason: string
}

const fetchedAt = new Date().toISOString().slice(0, 10)

async function main(): Promise<void> {
  const only = process.argv.find((arg) => arg.startsWith('--slug='))?.slice('--slug='.length)
  const tools = toolSeeds.filter((tool) => !only || tool.slug === only)
  if (tools.length === 0) throw new Error(only ? `Unknown slug ${only}` : 'No tools in the catalog')

  const outputDir = path.join(process.cwd(), LOGO_PUBLIC_DIR)
  await mkdir(outputDir, { recursive: true })
  if (CACHE_ROOT) await mkdir(CACHE_ROOT, { recursive: true })

  const results = await mapPool(tools, 8, (tool) => collectTool(tool))
  const entries: ManifestEntry[] = []
  const fallbacks: { slug: string; reason: string }[] = []
  for (const result of results) {
    if (result.entry) entries.push(result.entry)
    else fallbacks.push({ slug: result.slug, reason: result.reason })
    const line = result.entry ? `ok ${result.slug} ${result.entry.sourceUrl}` : `fallback ${result.slug} ${result.reason}`
    console.log(line)
  }

  await closeBrowser()
  entries.sort((a, b) => a.slug.localeCompare(b.slug))
  if (!only) {
    const kept = new Set(entries.map((entry) => `${entry.slug}.webp`))
    for (const name of await readdir(outputDir)) {
      if (!name.endsWith('.webp')) continue
      if (!kept.has(name)) await rm(path.join(outputDir, name))
    }
  }

  const manifestPath = path.join(process.cwd(), LOGO_MANIFEST_PATH)
  const slugsPath = path.join(process.cwd(), LOGO_SLUGS_PATH)
  if (!only) {
    await writeFile(manifestPath, `${JSON.stringify(entries, null, 2)}\n`)
    await writeFile(slugsPath, `${JSON.stringify(entries.map((entry) => entry.slug), null, 2)}\n`)
  }
  console.log(`wrote ${entries.length} logos, ${fallbacks.length} monogram fallbacks`)
  console.log(`fallbacks: ${fallbacks.map((item) => item.slug).join(', ') || '(none)'}`)
}

async function collectTool(tool: { slug: string; url: string; allowedHosts: readonly string[] }): Promise<ToolResult> {
  try {
    const page = await fetchOwn(tool.url, tool.url, tool.allowedHosts, 1_500_000)
    const candidates: Candidate[] = []
    if (page) {
      const html = page.buffer.toString('utf8')
      const base = new URL(page.finalUrl)
      candidates.push(...(await expandManifests(candidatesFromHtml(html, base, tool.url, tool.allowedHosts), tool.url, tool.allowedHosts)))
      const saved = await firstGood(tool, candidates)
      if (saved) return saved
      const press = await pressCandidates(html, base, tool.url, tool.allowedHosts)
      const fromPress = await firstGood(tool, press)
      if (fromPress) return fromPress
    } else {
      const saved = await firstGood(tool, originCandidates(tool.url, tool.allowedHosts))
      if (saved) return saved
      const browsed = await browserCandidates(tool)
      const fromBrowser = await firstGood(tool, browsed)
      if (fromBrowser) return fromBrowser
    }
    return { slug: tool.slug, entry: null, reason: 'no square icon of at least 128px on the tool site' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'fetch failed'
    return { slug: tool.slug, entry: null, reason: message }
  }
}

type HeadlessBrowser = {
  newContext: (options: { userAgent: string }) => Promise<{
    newPage: () => Promise<{
      goto: (url: string, options: { waitUntil: 'domcontentloaded'; timeout: number }) => Promise<unknown>
      title: () => Promise<string>
      url: () => string
      waitForTimeout: (ms: number) => Promise<void>
      evaluate: <T>(fn: () => T) => Promise<T>
    }>
    request: { get: (url: string, options: { timeout: number }) => Promise<{ ok: () => boolean; url: () => string; body: () => Promise<Buffer> }> }
    close: () => Promise<void>
  }>
  close: () => Promise<void>
}

let browserPromise: Promise<HeadlessBrowser | null> | null = null
let browserChain: Promise<unknown> = Promise.resolve()

async function browserCandidates(tool: { url: string; allowedHosts: readonly string[] }): Promise<Candidate[]> {
  const run = browserChain.then(() => loadBrowserIcons(tool))
  browserChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function loadBrowserIcons(tool: { url: string; allowedHosts: readonly string[] }): Promise<Candidate[]> {
  const browser = await sharedBrowser()
  if (!browser) return []
  const context = await browser.newContext({ userAgent: USER_AGENT })
  const page = await context.newPage()
  try {
    await page.goto(tool.url, { waitUntil: 'domcontentloaded', timeout: 25_000 })
    if (/just a moment/i.test(await page.title())) await page.waitForTimeout(8_000)
    const finalUrl = page.url()
    if (!isToolSiteUrl(finalUrl, tool.url, tool.allowedHosts)) return originCandidates(tool.url, tool.allowedHosts)
    const links = await page.evaluate(() =>
      [...document.querySelectorAll('link')].map((node) => ({
        rel: node.getAttribute('rel') || '',
        href: node.getAttribute('href') || '',
        type: node.getAttribute('type') || '',
        sizes: node.getAttribute('sizes') || '',
      })),
    )
    const base = new URL(finalUrl)
    const found = originCandidates(tool.url, tool.allowedHosts)
    for (const link of links) {
      if (!/icon|apple-touch/i.test(link.rel)) continue
      const candidate = candidateFromHref(
        link.href,
        base,
        tool.url,
        tool.allowedHosts,
        hintFor(link.rel, link.type, link.sizes, link.href),
        finalUrl,
      )
      if (candidate) found.push(candidate)
    }
    found.sort((a, b) => b.hint - a.hint)
    const downloaded: Candidate[] = []
    const seen = new Set<string>()
    for (const candidate of found) {
      if (seen.has(candidate.url) || downloaded.length >= 6) continue
      seen.add(candidate.url)
      if (candidate.inline) {
        downloaded.push(candidate)
        continue
      }
      const response = await context.request.get(candidate.url, { timeout: 12_000 }).catch(() => null)
      if (!response?.ok()) continue
      if (!isToolSiteUrl(response.url(), tool.url, tool.allowedHosts)) continue
      downloaded.push({ url: response.url(), hint: candidate.hint, inline: Buffer.from(await response.body()) })
    }
    return downloaded
  } catch {
    return []
  } finally {
    await context.close()
  }
}

async function sharedBrowser(): Promise<HeadlessBrowser | null> {
  if (!browserPromise) {
    browserPromise = import('@playwright/test')
      .then(async (mod) => mod.chromium.launch({ headless: true }) as Promise<HeadlessBrowser>)
      .catch(() => null)
  }
  return browserPromise
}

async function closeBrowser(): Promise<void> {
  const browser = browserPromise ? await browserPromise : null
  await browser?.close()
  browserPromise = null
}

function originCandidates(toolUrl: string, allowedHosts: readonly string[]): Candidate[] {
  let origin: string
  try {
    origin = new URL(toolUrl).origin
  } catch {
    return []
  }
  return WELL_KNOWN.flatMap((item) => {
    const url = `${origin}${item.path}`
    return isToolSiteUrl(url, toolUrl, allowedHosts) ? [{ url, hint: item.hint }] : []
  })
}

async function firstGood(
  tool: { slug: string; url: string; allowedHosts: readonly string[] },
  candidates: Candidate[],
): Promise<ToolResult | null> {
  const ordered = [...candidates].sort((a, b) => b.hint - a.hint)
  const seen = new Set<string>()
  let tries = 0
  for (const candidate of ordered) {
    if (isManifestUrl(candidate.url)) continue
    const key = candidate.inline ? `inline:${createHash('sha256').update(candidate.inline).digest('hex')}` : candidate.url
    if (seen.has(key)) continue
    seen.add(key)
    try {
      const buffer = candidate.inline ?? (await loadImage(candidate.url, tool.url, tool.allowedHosts))
      if (!buffer) continue
      tries += 1
      if (tries > 8) break
      const webp = await normalizeLogo(buffer)
      if (!webp) continue
      const file = path.join(process.cwd(), LOGO_PUBLIC_DIR, `${tool.slug}.webp`)
      await writeFile(file, webp)
      return {
        slug: tool.slug,
        reason: '',
        entry: { slug: tool.slug, sourceUrl: candidate.url, fetchedAt },
      }
    } catch {
      // Try the next candidate from the same site.
    }
  }
  return null
}

function candidatesFromHtml(html: string, base: URL, toolUrl: string, allowedHosts: readonly string[]): Candidate[] {
  const found: Candidate[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, 'rel').toLowerCase()
    const href = attr(tag, 'href')
    if (!href) continue
    if (rel === 'manifest') {
      const manifest = resolveOwn(href, base, toolUrl, allowedHosts)
      if (manifest) found.push({ url: manifest, hint: 20 })
      continue
    }
    const iconRel = rel.includes('icon') || rel.includes('apple-touch')
    if (!iconRel) continue
    const candidate = candidateFromHref(href, base, toolUrl, allowedHosts, hintFor(rel, attr(tag, 'type'), attr(tag, 'sizes'), href), base.toString())
    if (candidate) found.push(candidate)
  }
  for (const item of WELL_KNOWN) {
    const url = resolveOwn(item.path, base, toolUrl, allowedHosts)
    if (url) found.push({ url, hint: item.hint })
  }
  return found
}

const WELL_KNOWN: { path: string; hint: number }[] = [
  { path: '/apple-touch-icon.png', hint: 210 },
  { path: '/apple-touch-icon-precomposed.png', hint: 200 },
  { path: '/favicon.svg', hint: 190 },
  { path: '/icon.svg', hint: 180 },
  { path: '/android-chrome-512x512.png', hint: 170 },
  { path: '/android-chrome-192x192.png', hint: 160 },
  { path: '/favicon-512x512.png', hint: 150 },
  { path: '/favicon-192x192.png', hint: 140 },
  { path: '/favicon.ico', hint: 30 },
]

function fileLooksLikeLogo(href: string): boolean {
  const pathName = href.split('?')[0]?.split('#')[0]?.split('/').pop()?.toLowerCase() ?? ''
  if (!pathName) return false
  if (/dont|misuse|wrong|example|screenshot|photo|avatar|customer|people/.test(pathName)) return false
  if (/\/dont\//i.test(href)) return false
  return /logo|icon|favicon|apple-touch|logomark|brandmark/.test(pathName)
}

function hintFor(rel: string, type: string, sizes: string, href: string): number {
  let hint = 10
  if (rel.includes('apple-touch')) hint += 40
  if (type.includes('svg') || href.split('?')[0]?.endsWith('.svg')) hint += 80
  const match = sizes.match(/(\d+)\s*x\s*(\d+)/i)
  if (match) {
    const width = Number(match[1])
    const height = Number(match[2])
    const min = Math.min(width, height)
    const aspect = width / height
    if (min >= MIN_RASTER && aspect > 0.75 && aspect < 1.35) hint += 100 + Math.min(min, 512)
    else if (min >= MIN_RASTER) hint += 20
    else hint -= 80
  }
  return hint
}

async function pressCandidates(
  html: string,
  base: URL,
  toolUrl: string,
  allowedHosts: readonly string[],
): Promise<Candidate[]> {
  const hrefs = [...html.matchAll(/<a\b[^>]*href\s*=\s*("([^"]+)"|'([^']+)'|([^\s>]+))/gi)]
    .map((match) => decode(match[2] || match[3] || match[4] || ''))
    .filter((href) => /press|brand|media-kit|logo/i.test(href))
  const pages: string[] = []
  for (const href of hrefs) {
    const url = resolveOwn(href, base, toolUrl, allowedHosts)
    if (!url || pages.includes(url)) continue
    pages.push(url)
    if (pages.length >= 2) break
  }
  const candidates: Candidate[] = []
  for (const pageUrl of pages) {
    const page = await fetchOwn(pageUrl, toolUrl, allowedHosts, 1_500_000)
    if (!page) continue
    const text = page.buffer.toString('utf8')
    const pageBase = new URL(page.finalUrl)
    const tags = text.match(/<(?:img|a|link)\b[^>]*>/gi) ?? []
    for (const tag of tags) {
      const href = attr(tag, 'href') || attr(tag, 'src')
      if (!href) continue
      if (!/\.(svg|png|webp|jpe?g)(\?|$)/i.test(href) && !href.startsWith('data:image/')) continue
      if (!fileLooksLikeLogo(href)) continue
      const candidate = candidateFromHref(href, pageBase, toolUrl, allowedHosts, 60, pageBase.toString())
      if (candidate) candidates.push(candidate)
    }
  }
  return candidates
}

function candidateFromHref(
  href: string,
  base: URL,
  toolUrl: string,
  allowedHosts: readonly string[],
  hint: number,
  pageUrl: string,
): Candidate | null {
  if (href.startsWith('data:image/')) {
    const decoded = decodeDataImage(href)
    if (!decoded) return null
    if (!isToolSiteUrl(pageUrl, toolUrl, allowedHosts)) return null
    return { url: pageUrl, hint, inline: decoded }
  }
  const url = resolveOwn(href, base, toolUrl, allowedHosts)
  if (!url) return null
  return { url, hint }
}

async function expandManifests(candidates: Candidate[], toolUrl: string, allowedHosts: readonly string[]): Promise<Candidate[]> {
  const expanded = [...candidates]
  for (const candidate of candidates) {
    if (!isManifestUrl(candidate.url)) continue
    const manifest = await fetchOwn(candidate.url, toolUrl, allowedHosts, 500_000)
    if (!manifest) continue
    let parsed: { icons?: { src?: string; sizes?: string; type?: string }[] }
    try {
      parsed = JSON.parse(manifest.buffer.toString('utf8')) as { icons?: { src?: string; sizes?: string; type?: string }[] }
    } catch {
      continue
    }
    const base = new URL(manifest.finalUrl)
    for (const icon of parsed.icons ?? []) {
      if (!icon.src) continue
      const min = declaredMin(icon.sizes)
      const svg = Boolean(icon.type?.includes('svg') || icon.src.includes('.svg'))
      if (min > 0 && min < MIN_RASTER && !svg) continue
      const hint = 70 + (svg ? 40 : Math.min(min, 512))
      const next = candidateFromHref(icon.src, base, toolUrl, allowedHosts, hint, base.toString())
      if (next) expanded.push(next)
    }
  }
  return expanded
}

function isManifestUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase()
    return pathname.endsWith('.webmanifest') || (pathname.endsWith('.json') && pathname.includes('manifest'))
  } catch {
    return false
  }
}

function resolveOwn(href: string, base: URL, toolUrl: string, allowedHosts: readonly string[]): string | null {
  if (!href || href.startsWith('data:') || href.startsWith('javascript:')) return null
  let url: URL
  try {
    url = new URL(href, base)
  } catch {
    return null
  }
  url.hash = ''
  const serialized = url.toString()
  if (!isToolSiteUrl(serialized, toolUrl, allowedHosts)) return null
  return serialized
}

async function loadImage(url: string, toolUrl: string, allowedHosts: readonly string[]): Promise<Buffer | null> {
  const image = await fetchOwn(url, toolUrl, allowedHosts, 4_000_000)
  return image?.buffer ?? null
}

function declaredMin(sizes: string | undefined): number {
  const match = sizes?.match(/(\d+)\s*x\s*(\d+)/i)
  if (!match) return 0
  return Math.min(Number(match[1]), Number(match[2]))
}

async function fetchOwn(
  url: string,
  toolUrl: string,
  allowedHosts: readonly string[],
  maxBytes: number,
): Promise<{ buffer: Buffer; finalUrl: string } | null> {
  if (!isToolSiteUrl(url, toolUrl, allowedHosts)) return null
  const cached = await readCache(url)
  if (cached) {
    if (!isToolSiteUrl(cached.finalUrl, toolUrl, allowedHosts)) return null
    return cached
  }
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 12_000)
      try {
        const response = await fetch(url, {
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'user-agent': USER_AGENT,
            accept: 'text/html,application/xhtml+xml,image/png,image/svg+xml,image/webp,image/*,*/*;q=0.8',
          },
        })
        if (response.status === 429 || response.status >= 500) {
          lastError = new Error(`status ${response.status}`)
          await delay(400 * (attempt + 1))
          continue
        }
        if (!response.ok) return null
        if (!isToolSiteUrl(response.url, toolUrl, allowedHosts)) return null
        const buffer = await readLimited(response, maxBytes)
        const result = { buffer, finalUrl: response.url }
        await writeCache(url, result)
        return result
      } finally {
        clearTimeout(timer)
      }
    } catch (error) {
      lastError = error
      await delay(400 * (attempt + 1))
    }
  }
  if (lastError) return null
  return null
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

/** Pad the mark onto a 128px white rounded tile. Returns null when the asset is too small, too wide, or unreadable. */
export async function normalizeLogo(input: Buffer): Promise<Buffer | null> {
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
  const tile = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg"><rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="#ffffff"/></svg>`,
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
    const text = input.toString('utf8')
    if (!svgIsSafe(text)) return null
    const meta = await sharp(input, { density: 72 }).metadata()
    const maxSide = Math.max(meta.width ?? MIN_RASTER, meta.height ?? MIN_RASTER)
    const density = Math.min(600, Math.max(144, Math.round((72 * 512) / maxSide)))
    const raster = await sharp(input, { density }).png().toBuffer()
    return { raster, vector: true }
  }
  if (sniff === 'ico') {
    const png = largestIcoPng(input)
    if (png) return { raster: png, vector: false }
    try {
      const raster = await sharp(input).png().toBuffer()
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
  if (/<foreignobject/i.test(text)) return false
  if (/\s(?:href|xlink:href|src)\s*=\s*["']https?:/i.test(text)) return false
  if (/url\(\s*["']?https?:/i.test(text)) return false
  return lower.includes('<svg')
}

function largestIcoPng(buffer: Buffer): Buffer | null {
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return null
  const count = buffer.readUInt16LE(4)
  let best: Buffer | null = null
  let bestSide = 0
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16
    if (entry + 16 > buffer.length) break
    const width = buffer[entry] || 256
    const height = buffer[entry + 1] || 256
    const bytes = buffer.readUInt32LE(entry + 8)
    const offset = buffer.readUInt32LE(entry + 12)
    if (offset + bytes > buffer.length) continue
    const image = buffer.subarray(offset, offset + bytes)
    const png = image.length > 8 && image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47
    const side = Math.min(width, height)
    if (!png || side < bestSide) continue
    best = Buffer.from(image)
    bestSide = side
  }
  return best
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

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return decode(match?.[2] || match?.[3] || match?.[4] || '')
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function decodeDataImage(value: string): Buffer | null {
  const match = value.match(/^data:(image\/[a-z0-9.+-]+)(?:;charset=[^;,]+)?(;base64)?,(.*)$/i)
  if (!match) return null
  const payload = match[3] ?? ''
  try {
    return match[2] ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload))
  } catch {
    return null
  }
}

function cachePath(url: string): string | null {
  if (!CACHE_ROOT) return null
  return path.join(CACHE_ROOT, createHash('sha256').update(url).digest('hex'))
}

async function readCache(url: string): Promise<{ buffer: Buffer; finalUrl: string } | null> {
  const file = cachePath(url)
  if (!file || !existsSync(file)) return null
  const raw = await readFile(file)
  const split = raw.indexOf(0)
  if (split < 0) return null
  return { finalUrl: raw.subarray(0, split).toString('utf8'), buffer: raw.subarray(split + 1) }
}

async function writeCache(url: string, value: { buffer: Buffer; finalUrl: string }): Promise<void> {
  const file = cachePath(url)
  if (!file) return
  await writeFile(file, Buffer.concat([Buffer.from(value.finalUrl, 'utf8'), Buffer.from([0]), value.buffer]))
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
