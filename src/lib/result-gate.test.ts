import { describe, expect, it } from 'vitest'
import { decideResultGate, RESULT_GATE_BUDGET_MS } from './result-gate'
import { resultNotFoundHtml, resultUnavailableHtml } from './result-http'

function robotsDirectives(html: string): string[] {
  return [...html.matchAll(/<meta\b[^>]*>/gi)]
    .filter((match) => /name=["']robots["']/i.test(match[0]))
    .map((match) => match[0].match(/content=["']([^"']*)["']/i)?.[1] ?? '')
}

function unused<T>(): Promise<T> {
  throw new Error('should not run')
}

describe('result gate', () => {
  it('uses an 800ms budget and 404s a missing task when the lookup answers', async () => {
    expect(RESULT_GATE_BUDGET_MS).toBe(800)
    let pageLookup = false
    const decision = await decideResultGate({
      view: '',
      deadlineMs: 50,
      lookup: async () => 'not-found',
      pageLookup: async () => {
        pageLookup = true
        return 'ok'
      },
      limit: async () => ({ ok: true, resetAt: 0 }),
    })
    expect(decision).toEqual({ type: 'not-found' })
    expect(pageLookup).toBe(false)
    expect(robotsDirectives(resultNotFoundHtml())).toEqual(['noindex, nofollow'])
  })

  it('404s when the catalog lookup fails or times out and the page cannot find the task', async () => {
    const thrown = await decideResultGate({
      view: '',
      deadlineMs: 40,
      lookup: async () => {
        throw new Error('database unavailable')
      },
      pageLookup: async () => 'not-found',
      limit: async () => {
        throw new Error('limit should not run')
      },
    })
    expect(thrown).toEqual({ type: 'not-found' })

    const started = Date.now()
    const hung = await decideResultGate({
      view: '',
      deadlineMs: 40,
      lookup: () => new Promise(() => {}),
      pageLookup: async () => 'not-found',
      limit: unused,
    })
    expect(Date.now() - started).toBeLessThan(400)
    expect(hung).toEqual({ type: 'not-found' })
    expect(robotsDirectives(resultNotFoundHtml())).toEqual(['noindex, nofollow'])
  })

  it('503s when the page lookup is still down, instead of rendering', async () => {
    const thrown = await decideResultGate({
      view: '',
      deadlineMs: 40,
      lookup: async () => {
        throw new Error('database unavailable')
      },
      pageLookup: async () => {
        throw new Error('database unavailable')
      },
      limit: unused,
    })
    expect(thrown).toEqual({ type: 'unavailable' })

    const started = Date.now()
    const hung = await decideResultGate({
      view: 'all',
      deadlineMs: 40,
      lookup: () => new Promise(() => {}),
      pageLookup: () => new Promise(() => {}),
      limit: async () => {
        throw new Error('limit should not run')
      },
    })
    expect(Date.now() - started).toBeLessThan(400)
    expect(hung).toEqual({ type: 'unavailable' })
    expect(robotsDirectives(resultUnavailableHtml())).toEqual(['noindex, nofollow'])
  })

  it('continues a found task after the catalog lookup fails, then applies the quiz limit', async () => {
    const decision = await decideResultGate({
      view: '',
      deadlineMs: 40,
      lookup: async () => {
        throw new Error('database unavailable')
      },
      pageLookup: async () => 'ok',
      limit: async () => ({ ok: false, resetAt: 5_000 }),
    })
    expect(decision).toEqual({ type: 'limited', resetAt: 5_000 })
  })

  it('continues when the rate-limit write throws or takes longer than the budget', async () => {
    const thrown = await decideResultGate({
      view: '',
      deadlineMs: 40,
      lookup: async () => 'ok',
      pageLookup: unused,
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
      pageLookup: unused,
      limit: () => new Promise(() => {}),
    })
    expect(Date.now() - started).toBeLessThan(400)
    expect(hung).toEqual({ type: 'continue' })
  })

  it('still blocks a quiz that is over the limit', async () => {
    const decision = await decideResultGate({
      view: '',
      lookup: async () => 'ok',
      pageLookup: unused,
      limit: async () => ({ ok: false, resetAt: 5_000 }),
    })
    expect(decision).toEqual({ type: 'limited', resetAt: 5_000 })
  })

  it('does not rate limit an all-matches view', async () => {
    let limited = false
    const decision = await decideResultGate({
      view: 'all',
      lookup: async () => 'ok',
      pageLookup: unused,
      limit: async () => {
        limited = true
        return { ok: false, resetAt: 5_000 }
      },
    })
    expect(decision).toEqual({ type: 'continue' })
    expect(limited).toBe(false)
  })
})
