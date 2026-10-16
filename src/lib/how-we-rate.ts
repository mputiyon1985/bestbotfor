export type HowWeRateBlock =
  | { type: 'h1'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }

/** The public page copy in src/content/how-we-rate.md. Headings, paragraphs, and lists only. */
export function parseHowWeRate(markdown: string): HowWeRateBlock[] {
  const lines = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n')
  const blocks: HowWeRateBlock[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line.trim() === '') {
      index += 1
      continue
    }
    if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2).trim() })
      index += 1
      continue
    }
    if (line.startsWith('- ')) {
      const items: string[] = []
      while (index < lines.length && (lines[index] ?? '').startsWith('- ')) {
        items.push((lines[index] ?? '').slice(2).trim())
        index += 1
      }
      blocks.push({ type: 'ul', items })
      continue
    }
    const paragraph: string[] = []
    while (index < lines.length) {
      const current = lines[index] ?? ''
      if (current.trim() === '' || current.startsWith('# ') || current.startsWith('- ')) break
      paragraph.push(current.trim())
      index += 1
    }
    blocks.push({ type: 'p', text: paragraph.join(' ') })
  }
  return blocks
}
