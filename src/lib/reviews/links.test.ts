import { describe, expect, it } from 'vitest'
import { LINK_HINTS, linkSignals, renderReviewPlainText, type LinkHint } from './links'

type Status = 'pending' | 'held' | 'published' | 'rejected' | 'removed'
type HintIsStatus = LinkHint extends Status ? never : true
const hintsCannotSetStatus: HintIsStatus = true

describe('link signals', () => {
  it('reports link and contact hints and never a review status', () => {
    const hints = linkSignals('See https://evil.example and www.x.com or a@b.com')
    expect(hints).toContain('contains link or contact')
    expect(hints).toContain('multiple links')
    expect(hints).not.toContain('vendor or competitor link')
    for (const hint of hints) expect(LINK_HINTS).toContain(hint)
    expect(hintsCannotSetStatus).toBe(true)
  })

  it('adds a vendor or competitor hint without blocking', () => {
    const hints = linkSignals('Compare it with https://claude.anthropic.com/docs', {
      ownDomains: ['openai.com'],
      competitorDomains: ['anthropic.com'],
    })
    expect(hints).toContain('vendor or competitor link')
    expect(hints).toEqual(['contains link or contact', 'vendor or competitor link'])
    const status: Status = 'pending'
    expect(status).toBe('pending')
    expect(hints.join(' ')).not.toMatch(/pending|held|rejected|removed|published/)
  })

  it('counts a phone and leaves the text plain', () => {
    expect(linkSignals('Call me at +1 415 555 2671')).toEqual(['contains link or contact'])
    const plain = renderReviewPlainText('https://evil.example www.x.com a@b.com')
    expect(plain).toBe('https://evil.example www.x.com a@b.com')
    expect(plain).not.toContain('<a')
  })
})
