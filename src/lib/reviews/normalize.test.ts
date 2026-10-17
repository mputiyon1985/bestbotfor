import { describe, expect, it } from 'vitest'
import { normalizeReviewText } from './normalize'

describe('normalizeReviewText', () => {
  it('keeps visible text and line breaks, and strips bidi, zero-width, and controls', () => {
    const input = 'hello\u202Eworld\u200D\u0000</script>\nnext'
    const normalized = normalizeReviewText(input)
    expect(normalized).toBe('helloworld</script>\nnext')
    expect(normalized).toContain('</script>')
    expect(normalized).not.toContain('\u202E')
    expect(normalized).not.toContain('\u200D')
  })

  it('normalizes to NFC', () => {
    expect(normalizeReviewText('e\u0301')).toBe('é')
  })
})
