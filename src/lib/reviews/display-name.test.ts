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
})
