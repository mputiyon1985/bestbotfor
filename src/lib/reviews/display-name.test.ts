import { describe, expect, it } from 'vitest'
import { checkDisplayName, DISPLAY_NAME_MAX_LENGTH, DISPLAY_NAME_TOO_LONG_MESSAGE } from './display-name'

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
    expect(checkDisplayName('Modi', chatgpt)).toEqual({ ok: true })
    expect(checkDisplayName('mod')).toEqual({ ok: false, reason: 'reserved' })
    expect(checkDisplayName('admin')).toEqual({ ok: false, reason: 'reserved' })
    expect(checkDisplayName('Admin M.')).toEqual({ ok: false, reason: 'reserved' })
    expect(checkDisplayName('Best Bot For')).toEqual({ ok: false, reason: 'reserved' })
  })

  it('refuses a reserved name split across spaces or separators', () => {
    expect(checkDisplayName('ad min')).toEqual({ ok: false, reason: 'reserved' })
    expect(checkDisplayName('a d m i n')).toEqual({ ok: false, reason: 'reserved' })
    expect(checkDisplayName('bestbot for')).toEqual({ ok: false, reason: 'reserved' })
    expect(checkDisplayName('Chat GPT', chatgpt)).toEqual({ ok: false, reason: 'reserved' })
    expect(checkDisplayName('Open AI', chatgpt)).toEqual({ ok: false, reason: 'reserved' })
    expect(checkDisplayName('Modi')).toEqual({ ok: true })
  })

  it('rejects a name over 64 characters before normalization, and checks a worst-case 64-character name quickly', () => {
    const worst = 'a '.repeat(DISPLAY_NAME_MAX_LENGTH / 2)
    expect(worst).toHaveLength(DISPLAY_NAME_MAX_LENGTH)
    checkDisplayName('Maria L.')
    const started = performance.now()
    const decision = checkDisplayName(worst)
    const elapsed = performance.now() - started
    expect(decision).toEqual({ ok: true })
    expect(elapsed).toBeLessThan(5)

    const tooLong = 'a '.repeat(1000)
    expect(tooLong.length).toBeGreaterThan(DISPLAY_NAME_MAX_LENGTH)
    const rejectStarted = performance.now()
    const rejected = checkDisplayName(tooLong)
    const rejectElapsed = performance.now() - rejectStarted
    expect(rejected).toEqual({ ok: false, reason: 'too_long', message: DISPLAY_NAME_TOO_LONG_MESSAGE })
    expect(rejectElapsed).toBeLessThan(5)

    expect(checkDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH)).ok).toBe(true)
    expect(checkDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: 'too_long',
      message: DISPLAY_NAME_TOO_LONG_MESSAGE,
    })
  })
})
