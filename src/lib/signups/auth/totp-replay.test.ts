import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { withSignupsAuthDb } from './fixture-db'
import { acceptTotp } from './accept-totp'
import { base32Encode, totpCode } from './totp'

const SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'))

describe('TOTP replay', () => {
  let closeDb: (() => Promise<void>) | undefined

  beforeEach(async () => {
    closeDb = await withSignupsAuthDb()
  })

  afterEach(async () => {
    await closeDb?.()
  })

  it('rejects a code again in the same time step and accepts the next step', async () => {
    const now = Date.parse('2026-06-01T12:00:00.000Z')
    const code = totpCode(SECRET, now)
    expect(await acceptTotp(code, SECRET, now)).toBe(true)
    expect(await acceptTotp(code, SECRET, now + 1_000)).toBe(false)
    const next = totpCode(SECRET, now + 30_000)
    expect(await acceptTotp(next, SECRET, now + 30_000)).toBe(true)
  })
})
