import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseHowWeRate } from './how-we-rate'

describe('how we rate', () => {
  it('parses the public page copy and leaves source columns out', () => {
    const markdown = readFileSync(path.join(process.cwd(), 'src/content/how-we-rate.md'), 'utf8')
    const blocks = parseHowWeRate(markdown)
    expect(blocks[0]).toEqual({ type: 'h1', text: 'How we rate AI tools' })
    const text = blocks
      .map((block) => (block.type === 'ul' ? block.items.join('\n') : block.text))
      .join('\n')
    expect(text).toContain('Quality (40%)')
    expect(text).toContain('within 0.1')
    expect(text).toContain('GitHub stars count as a quality signal only at 1,000 stars or more.')
    expect(text).toContain('A tested review published by a university library counts as a quality source too.')
    expect(text).toContain('one quality source is enough to rate a tool, but taking #1 in a category needs two independent quality sources.')
    expect(text).toContain('each publisher or app store counts as one source, however many pages or entries it has.')
    expect(text).toContain("A tested review or roundup that reaches a negative verdict on a tool doesn't count as a quality source for it.")
    expect(text).toContain('We keep the evidence and sources for each score on file and review them quarterly.')
    expect(text).not.toContain('Every score links to its sources')
    expect(text).not.toContain('links to its sources')
    expect(text).not.toContain('pcmag.com')
    expect(text).not.toContain('evidence.jsonl')
    expect(text).not.toContain('http')
    expect(text).not.toContain('source_urls')
  })
})
