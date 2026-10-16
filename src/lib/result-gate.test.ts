import { describe, expect, it } from 'vitest'
import { decideResultGate, RESULT_GATE_BUDGET_MS } from './result-gate'
import { resultMissMetadata } from './result-http'

describe('result gate', () => {
  it('uses an 800ms budget and 404s a missing task when the lookup answers', async () => {
    expect(RESULT_GATE_BUDGET_MS).toBe(800)
    const decision = await decideResultGate({
      view: '',
      deadlineMs: 50,
      lookup: async () => 'not-found',
      limit: async () => ({ ok: true, resetAt: 0 }),
    })
    expect(decision).toEqual({ type: 'not-found' })
    expect(resultMissMetadata().robots).toEqual({ index: false, follow: false })
  })

  it('continues when the catalog lookup throws or takes longer than the budget', async () => {
    const thrown = await decideResultGate({
      view: '',
      deadlineMs: 40,
      lookup: async () => {
        throw new Error('database unavailable')
      },
      limit: async () => ({ ok: true, resetAt: 0 }),
    })
    expect(thrown).toEqual({ type: 'continue' })

    const started = Date.now()
    const hung = await decideResultGate({
      view: '',
      deadlineMs: 40,
      lookup: () => new Promise(() => {}),
      limit: async () => ({ ok: true, resetAt: 0 }),
    })
    expect(Date.now() - started).toBeLessThan(400)
    expect(hung).toEqual({ type: 'continue' })
    expect(resultMissMetadata().robots).toEqual({ index: false, follow: false })
  })

  it('continues when the rate-limit write throws or takes longer than the budget', async () => {
    const thrown = await decideResultGate({
      view: '',
      deadlineMs: 40,
      lookup: async () => 'ok',
      limit: async () => {
        throw new Error('database unavailable')
      },
    })
    expect(thrown).toEqual({ type: 'continue' })

    const started = Date.now()
    const hung = await decideResultGate({
      view: '',
      deadlineMs: 40,
      lookup: async () => 'ok',
      limit: () => new Promise(() => {}),
    })
    expect(Date.now() - started).toBeLessThan(400)
    expect(hung).toEqual({ type: 'continue' })
  })

  it('still blocks a quiz that is over the limit', async () => {
    const decision = await decideResultGate({
      view: '',
      lookup: async () => 'ok',
      limit: async () => ({ ok: false, resetAt: 5_000 }),
    })
    expect(decision).toEqual({ type: 'limited', resetAt: 5_000 })
  })

  it('does not rate limit an all-matches view', async () => {
    let limited = false
    const decision = await decideResultGate({
      view: 'all',
      lookup: async () => 'ok',
      limit: async () => {
        limited = true
        return { ok: false, resetAt: 5_000 }
      },
    })
    expect(decision).toEqual({ type: 'continue' })
    expect(limited).toBe(false)
  })
})
