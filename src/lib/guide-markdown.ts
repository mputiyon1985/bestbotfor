/**
 * Minimal markdown for the category guides: ##/### headings, paragraphs,
 * "-" lists and pipe tables; inline **bold**, *italic* and [text](url).
 * Output is plain data rendered as React elements (no raw HTML).
 */
export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'link'; href: string; kind: 'internal' | 'go' | 'external'; children: Inline[] }

export type Block =
  | { type: 'heading'; level: 2 | 3; text: string; id: string }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; items: Inline[][] }
  | { type: 'table'; head: Inline[][]; rows: Inline[][][] }

const SITE_ORIGIN = 'https://bestbotfor.com'

export function headingId(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

/** Site links become relative paths; only https external links survive. */
export function guideHref(raw: string): { href: string; kind: 'internal' | 'go' | 'external' } | null {
  let url: URL
  try {
    url = new URL(raw, SITE_ORIGIN)
  } catch {
    return null
  }
  if (url.origin === SITE_ORIGIN) {
    const href = `${url.pathname}${url.search}${url.hash}`
    return { href, kind: url.pathname.startsWith('/go/') ? 'go' : 'internal' }
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  return { href: url.toString(), kind: 'external' }
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*([^*]+)\*/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) out.push({ type: 'text', text: text.slice(last, index) })
    if (match[1] !== undefined) {
      const target = guideHref(match[2] ?? '')
      const label = match[1]
      out.push(target ? { type: 'link', ...target, children: parseInline(label) } : { type: 'text', text: label })
    } else if (match[3] !== undefined) out.push({ type: 'strong', children: parseInline(match[3]) })
    else out.push({ type: 'em', children: parseInline(match[4] ?? '') })
    last = index + match[0].length
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}

function cells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
}

export function parseGuideMarkdown(markdown: string): Block[] {
  const blocks: Block[] = []
  const lines = markdown.split('\n')
  const at = (n: number): string => lines[n] ?? ''
  let i = 0
  while (i < lines.length) {
    const line = at(i)
    if (!line.trim()) {
      i += 1
      continue
    }
    const heading = /^(#{2,3}) (.+)$/.exec(line)
    if (heading) {
      const text = (heading[2] ?? '').trim()
      blocks.push({ type: 'heading', level: (heading[1] ?? '').length as 2 | 3, text, id: headingId(text) })
      i += 1
      continue
    }
    if (line.startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && at(i).startsWith('|')) rows.push(at(i++))
      const [head = '', , ...body] = rows
      blocks.push({ type: 'table', head: cells(head).map(parseInline), rows: body.map((row) => cells(row).map(parseInline)) })
      continue
    }
    if (line.startsWith('- ')) {
      const items: Inline[][] = []
      while (i < lines.length && at(i).startsWith('- ')) items.push(parseInline(at(i++).slice(2)))
      blocks.push({ type: 'list', items })
      continue
    }
    const para: string[] = []
    while (i < lines.length && at(i).trim() && !/^(#{2,3} |\||- )/.test(at(i))) para.push(at(i++))
    blocks.push({ type: 'paragraph', children: parseInline(para.join(' ')) })
  }
  return blocks
}
