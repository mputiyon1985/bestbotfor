import { describe, expect, it } from 'vitest'
import { checkDisplayName } from './display-name'

const chatgpt = { toolNames: ['ChatGPT'], vendorNames: ['OpenAI'] }

describe('checkDisplayName', () => {
  it('refuses staff, brand, vendor, and homoglyph names, and accepts Maria L.', () => {
    expect(checkDisplayName('BestBotFor T.').ok).toBe(false)
    expect(checkDisplayName('B\u0435stbotfor T.').ok).toBe(false)
    expect(checkDisplayName('Admin M.').ok).toBe(false)
    expect(checkDisplayName('OpenAI S.', chatgpt).ok).toBe(false)
    expect(checkDisplayName('Maria L.', chatgpt)).toEqual({ ok: true })
  })

  it('refuses a word that mixes Latin and Cyrillic even without a reserved term', () => {
    const decision = checkDisplayName('Ann\u0430 L.')
    expect(decision.ok).toBe(false)
    if (!decision.ok) expect(decision.reason).toBe('mixed_script')
  })

  it('strips combining marks before the reserved-name check', () => {
    expect(checkDisplayName('a\u0307dmin')).toEqual({ ok: false, reason: 'reserved' })
    expect(checkDisplayName('\u0227dmin M.')).toEqual({ ok: false, reason: 'reserved' })
  })

  it('matches reserved names as whole tokens', () => {
    expect(checkDisplayName('Modi')).toEqual({ ok: true })
    expect(checkDisplayName('mod')).toEqual({ ok: false, reason: 'reserved' })
    expect(checkDisplayName('admin')).toEqual({ ok: false, reason: 'reserved' })
    expect(checkDisplayName('Admin M.')).toEqual({ ok: false, reason: 'reserved' })
    expect(checkDisplayName('Best Bot For')).toEqual({ ok: false, reason: 'reserved' })
  })
})
