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
  '1password-for-agents', 'acta-ai', 'adflame', 'adobe-firefly', 'agav', 'agency-makors', 'agensh', 'agent-capability-contract', 'agent-co-founder', 'agent-inbox', 'agentgrid', 'agentranked', 'agentready-mcp', 'agentspot', 'agentteams', 'agentvalley', 'ai-canvas', 'ai-music-maker', 'ai-spar', 'ai-visibility-by-trulata', 'aidealy', 'aider', 'akked', 'aktor', 'al-narjis-ai', 'alsona', 'antelog', 'anvil', 'anyimg', 'apertrue-witness', 'arcade-ai-video', 'archon-ai', 'archseed', 'arcjet', 'arcroom', 'artie', 'arvak', 'askprobe', 'astral-homeschool', 'atlas-compiler', 'attest-agents', 'auteo', 'authentify', 'aven-app-agent', 'avp', 'aws-continuum', 'backplane', 'ballet', 'base-studio', 'basellm', 'baylo', 'beacon-sh', 'beeble', 'bidhelm', 'blushadow', 'boltai', 'boomship', 'botora', 'brainmate', 'burnstate', 'buzzmark', 'bysicle', 'byteask', 'bytevoice', 'cadreen-model-training', 'call-e', 'candor', 'captureflow', 'cardboard-ai', 'casecite', 'caughtthemagic', 'caveman-code', 'cedric-ai', 'celesto', 'chalkie', 'chat-cx', 'chatacademia', 'churnproof', 'cinnamon', 'circles-whatsapp', 'citewing', 'clamor', 'claude-duet', 'clawsgo-science', 'clayzo', 'cleanbleep', 'cliedesk', 'clips-by-plastic', 'cloudish', 'co-review', 'cobrain', 'codecaine', 'codela', 'codend', 'coderbaba', 'college-essay-grader', 'confidential-ai-cloud', 'constor', 'contactai-desk', 'context-dev', 'context-engine', 'coral-gateway', 'corgi', 'corpfinai', 'corply', 'cosyra', 'crawlito', 'crosshead', 'crystl', 'cuedis', 'dageno-ai', 'darkcrate', 'databox', 'dearinside', 'debo-ai', 'deeepspace', 'deep-agnt', 'deepcell', 'delightful-click', 'descant', 'design-lounge', 'designforge', 'designugc', 'dessa', 'dimensionkit', 'dippr', 'display-dev', 'docdost-ai', 'docsalot', 'docup', 'dori', 'dravik', 'dusk-bot', 'dynos-work', 'eardub', 'editedimage', 'elco-console', 'embage', 'empacer', 'engine7', 'enzo', 'eqvesta', 'exmergo-dex', 'face-shape-haircut-ai', 'fardesk', 'faros-desktop', 'farside-research', 'fefou', 'firsttake', 'flamigo', 'flashjini', 'floot', 'folklore-hq', 'fonazo', 'formulate-ai', 'foxpit', 'foxplug', 'futureproof', 'gamma', 'gamma-pdf', 'gatherhq-agent-research', 'gatrends', 'gemini-api-cli', 'geohats', 'get-shouting', 'glass-editor', 'glass-page', 'glasshand', 'glifa', 'goaltree', 'gologin-cloud-browser', 'gradium', 'graphtia', 'greenci', 'greta-sh', 'habakkuk', 'hako', 'haris', 'harnessrouter', 'heal-dev', 'helpwing', 'hemle', 'hera', 'hexta-ai', 'higgsfield', 'hiringnow', 'hob', 'holp', 'host0', 'hostbloom', 'hotline-computer', 'human-in-circuit', 'hurston-1', 'hyperresearch', 'idressy', 'inbox-hero', 'incredible-agents', 'infaiw', 'inferbase-ai', 'infinity-chat', 'insight7-voice-agents', 'instant-search', 'interviewengine', 'inyon', 'ivibe', 'ivycraft', 'jobmate-ai', 'journzy', 'kadeep-ai', 'keybrum', 'keycontain', 'kimi', 'kino-ai', 'kippy-ai', 'kira-id', 'kiwi', 'klaussy-review', 'klipa-ai', 'kosa8', 'krev-ai', 'kugelaudio-fluid', 'labby', 'lally-ai', 'lasso-mac', 'latch-ai', 'lectio', 'leda', 'letter-command-l', 'letterslot', 'lexicad', 'lexmount', 'lingomic', 'link-bio', 'linkintel', 'livereview', 'liveswap-ai', 'living-brain', 'llama-app', 'longformly', 'loqui', 'lottiefiles', 'lyra-labs', 'machinemail', 'machinence', 'mailbox-bot', 'major', 'makemidas', 'makethemcode', 'manyagents', 'maptake', 'maritime', 'marketing-decks', 'marsell', 'maxma', 'mcp1', 'mdkit', 'mermaid-flow', 'midjourney', 'mightywatcher', 'miingl-social', 'mimzie', 'mindwiki', 'mirra-ai', 'mister-blocks', 'mixos', 'model-citizens-studio', 'modelpeers', 'modern-computer', 'momentic', 'monid', 'monish', 'monity', 'moonbird', 'motionrepo', 'mova', 'movo-ai', 'murer-ai', 'my-professional-headshot', 'mypip', 'nameshot', 'narwal', 'nasiko', 'nestdaddy', 'neura-hq', 'newsology', 'next3d', 'nico', 'nightcafe', 'niveau7', 'nod', 'notra', 'nova-creative', 'novatek-book-publishing', 'novatoken', 'nutri-ai', 'obeya', 'ody-ai-phone', 'offiai', 'offstage-cloud', 'olbrain-alchemist', 'oll-e', 'ollav', 'omega-ai-app', 'omnigraph', 'omnitome', 'openbot', 'opendesign', 'openmail', 'openstate', 'opstether', 'oraculum', 'orama-lake', 'orbit-x', 'overmind', 'ovren', 'pablit', 'pammy', 'papermark', 'pauta', 'perit-marketplace', 'pharen-hub', 'pinecall', 'pizza-agent', 'plan-chat', 'plango', 'plinth-cloud', 'plurai', 'polipoll-surveys', 'polylane', 'polyroom', 'pomerado', 'ponder', 'precedent-ai', 'problembot', 'prodofoto', 'profittriage-ai', 'puffin-agents', 'pugsoda', 'pulsedev', 'qbit-elixir-labs', 'qoder', 'qorqbot', 'qpilot', 'quantmarketai', 'quest-advisor', 'quiksignal', 'quillbot', 'r3-hyperlogue', 'radar', 'rainbowsay', 'rainbrand', 'rakazo', 'rally-ai', 'rankfender', 'rankspot', 'rapid-indexer', 'rapvid', 'raven', 'reachpilot', 'readywhen', 'recall-agents-api', 'recursive-flint', 'regga', 'relay-ai', 'render-sandboxes', 'rendro', 'replay-mac', 'rerun', 'retriever-app', 'revix-ai', 'ridian', 'ringvia', 'ringzee', 'rising-tide-digital', 'riverside-agents', 'rystic', 's-space', 'saas-toolkit-mcp', 'sai', 'scalekit-agentkit', 'scanaris', 'scape', 'scatter-study', 'screen-studio', 'scroogefrog', 'seam-notch', 'search2o', 'securethread', 'seldon-wren', 'sellto-us', 'semdex', 'senaste', 'sendhour', 'sendr', 'shareofask', 'shogunai', 'shot-video', 'shotoku', 'sideos', 'signal-harbor', 'sikemux', 'silversafe-ai', 'simpleton', 'simular-box', 'skillbox', 'skillsmcp', 'snapdub', 'solarian', 'solipsist', 'sondia', 'sonomos-locke', 'soreqen-code', 'spacefast', 'spacesheep', 'spark-site', 'speakapp', 'specsight', 'spiritual-origin', 'spokendocs', 'spot-deemwar', 'stateweave', 'stiro', 'storewalk', 'storybook-ai', 'streaker-app', 'strokes', 'sume-api', 'superhands', 'superlog', 'syniru', 'synter', 'syrev', 'tabsh', 'tacie', 'takehound', 'talkify', 'talknative', 'tallbell', 'talyn', 'teamily-ai', 'tengochat', 'tesseract-eightcell', 'testaix', 'testifly', 'text-to-cad-studio', 'text-to-gif', 'textend', 'thebold', 'theysaid', 'three-dev', 'thrive', 'thrum', 'thunderphone', 'tinocall-ai-receptionist', 'tk-medium', 'to3d', 'tobira', 'tokenguard-os', 'toolmaker-agent', 'toone', 'toozi', 'trading-agents', 'trainn', 'transcript-dock', 'transinaut', 'trial-commander', 'trnrt', 'truinttrip', 'trustsniffer', 'tulu', 'tulvo', 'turbogen', 'turnstone', 'tutorbee', 'uagents8', 'ui-verify', 'unleashx', 'unmerge', 'urun', 'valin', 'vanira', 'vb-notes', 'versine', 'verspa', 'vetoo', 'vezapi', 'vibeide', 'videco', 'viggle-jst-2', 'vigilbase-os', 'vinc', 'vocelle', 'vondet', 'voplica-studio', 'voyager-fm', 'waggle', 'wakel', 'waldo-wherobots', 'warmprose', 'whiz-pub', 'whoiscooking', 'widefleet', 'willo', 'wispos', 'witness', 'wiyomi', 'wizardnote', 'wron', 'xeek-sites', 'xmind', 'yakafa', 'yantra-app', 'yofluent', 'yogurt', 'youart', 'yourcast', 'youxr', 'zcad-ai', 'zeus-agent', 'zode',
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
