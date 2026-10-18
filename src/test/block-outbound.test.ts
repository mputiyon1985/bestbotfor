import { describe, expect, it } from 'vitest'

describe('outbound fetch guard', () => {
  it('blocks a non-local host and still allows loopback', async () => {
    await expect(fetch('https://example.com/newsletter')).rejects.toThrow(/Blocked outbound test fetch to example.com/)
    await expect(fetch('https://api.beehiiv.com/v2/publications/pub_x/subscriptions')).rejects.toThrow(
      /Blocked outbound test fetch to api.beehiiv.com/,
    )
    try {
      await fetch('http://127.0.0.1:1/')
    } catch (error) {
      expect(error instanceof Error ? error.message : String(error)).not.toMatch(/Blocked outbound/)
    }
  })
})