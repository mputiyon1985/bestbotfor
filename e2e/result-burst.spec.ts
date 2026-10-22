import { spawn, type ChildProcess } from 'node:child_process'
import { expect, request as playwrightRequest, test } from '@playwright/test'
import { ACTION_LIMITS } from '../src/lib/action-limit'

const PEER_PORT = 3101

function startPeerServer(): { child: ChildProcess; baseURL: string; output: () => string } {
  const baseURL = `http://127.0.0.1:${PEER_PORT}`
  const chunks: Buffer[] = []
  const child = spawn('node_modules/.bin/tsx', ['scripts/serve.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PEER_PORT),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || 'file:./data/e2e.db',
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || 'local',
      VERCEL_ENV: 'test',
      RESULT_SHARED_LIMIT_MS: '800',
      RESULT_FAULTS: '1',
      // Same key as playwright.config.ts. A different secret makes a different
      // bucket, so the two processes would each allow their own half.
      RATE_LIMIT_HMAC_SECRET: 'playwright-rate-limit-hmac-secret-37b',
      REVIEW_IP_HMAC_SECRET: 'playwright-review-ip-hmac-secret-37b!',
      REVIEW_IP_HMAC_KEY_ID: 'k1',
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID || 'G-TESTCONSENT',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const keep = (chunk: Buffer) => {
    chunks.push(chunk)
    if (chunks.length > 40) chunks.shift()
  }
  child.stdout?.on('data', keep)
  child.stderr?.on('data', keep)
  return {
    child,
    baseURL,
    output: () => Buffer.concat(chunks).toString('utf8').slice(-1500),
  }
}

/**
 * A burst that starts in the last seconds of the minute lands in two windows.
 * Each window has a fresh counter, so the shared limit can miss every 429.
 * Wait for the next window when this one cannot hold the whole burst.
 */
async function alignBurstToWindow(windowMs = ACTION_LIMITS.result.windowMs, marginMs = 20_000): Promise<void> {
  const remaining = windowMs - (Date.now() % windowMs)
  if (remaining >= marginMs) return
  await new Promise((resolve) => setTimeout(resolve, remaining + 50))
}

async function waitForPeer(baseURL: string, child: ChildProcess, output: () => string): Promise<void> {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`peer server exited ${child.exitCode}: ${output()}`)
    try {
      const response = await fetch(baseURL)
      if (response.status < 500) return
    } catch {
      // The process is still binding the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`peer server did not listen: ${output()}`)
}

/**
 * Sentinel's check: 40 requests, 4 at a time, at a valid quiz URL.
 * A slow or healthy catalog must not answer 503. The limiter must still fire.
 */
test('one valid quiz answers in under 1.5s', async ({ request }) => {
  const headers = { 'x-forwarded-for': `2001:db8:1::${Date.now().toString(16)}` }
  const started = Date.now()
  const response = await request.get('/result?task=chat&budget=any&skill=beginner', { headers })
  const elapsed = Date.now() - started
  expect(response.status()).toBe(200)
  expect(elapsed, `single /result took ${elapsed}ms`).toBeLessThan(1_500)
})

test('40 valid quizzes at 4 concurrent return no 503s and some 429s', async () => {
  test.setTimeout(120_000)
  const baseURL = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000'
  const context = await playwrightRequest.newContext({ baseURL })
  const headers = { 'x-forwarded-for': `2001:db8:40:4::${Date.now().toString(16)}` }
  const path = '/result?task=chat&budget=any&skill=beginner'
  const total = 40
  const concurrency = 4
  const counts: Record<number, number> = {}
  let next = 0

  async function worker(): Promise<void> {
    while (next < total) {
      next += 1
      const response = await context.get(path, { headers })
      const status = response.status()
      counts[status] = (counts[status] ?? 0) + 1
      await response.body()
    }
  }

  try {
    await alignBurstToWindow()
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    const histogram = {
      '200': counts[200] ?? 0,
      '429': counts[429] ?? 0,
      '503': counts[503] ?? 0,
      other: Object.entries(counts)
        .filter(([status]) => status !== '200' && status !== '429' && status !== '503')
        .map(([status, count]) => `${status}:${count}`),
    }
    console.log(`sentinel result burst ${JSON.stringify(histogram)}`)
    expect(histogram['503'], JSON.stringify(histogram)).toBe(0)
    expect(histogram.other, JSON.stringify(histogram)).toEqual([])
    expect(histogram['429'], JSON.stringify(histogram)).toBe(total - ACTION_LIMITS.result.limit)
    expect(histogram['200'], JSON.stringify(histogram)).toBe(ACTION_LIMITS.result.limit)
  } finally {
    await context.dispose()
  }
})

test('two server processes sharing one database file return some 429s and no 503s', async () => {
  test.setTimeout(180_000)
  const peer = startPeerServer()
  const primary = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000'
  const headers = { 'x-forwarded-for': `2001:db8:40:2::${Date.now().toString(16)}` }
  const path = '/result?task=chat&budget=any&skill=beginner'
  const total = 40
  const concurrency = 4
  const counts: Record<number, number> = {}
  const perOrigin: Record<string, number> = { [primary]: 0, [peer.baseURL]: 0 }
  let next = 0

  try {
    await waitForPeer(peer.baseURL, peer.child, peer.output)
    const contexts = {
      [primary]: await playwrightRequest.newContext({ baseURL: primary }),
      [peer.baseURL]: await playwrightRequest.newContext({ baseURL: peer.baseURL }),
    }
    const origins = [primary, peer.baseURL]

    async function worker(): Promise<void> {
      while (next < total) {
        const index = next
        next += 1
        const origin = origins[index % origins.length] ?? primary
        const response = await contexts[origin]!.get(path, { headers })
        const status = response.status()
        counts[status] = (counts[status] ?? 0) + 1
        perOrigin[origin] = (perOrigin[origin] ?? 0) + 1
        await response.body()
      }
    }

    try {
      await alignBurstToWindow()
      await Promise.all(Array.from({ length: concurrency }, () => worker()))
      const histogram = {
        '200': counts[200] ?? 0,
        '429': counts[429] ?? 0,
        '503': counts[503] ?? 0,
        other: Object.entries(counts)
          .filter(([status]) => status !== '200' && status !== '429' && status !== '503')
          .map(([status, count]) => `${status}:${count}`),
        perOrigin,
      }
      console.log(`shared result burst ${JSON.stringify(histogram)}`)
      expect(perOrigin[primary], JSON.stringify(histogram)).toBe(total / 2)
      expect(perOrigin[peer.baseURL], JSON.stringify(histogram)).toBe(total / 2)
      expect(histogram['503'], JSON.stringify(histogram)).toBe(0)
      expect(histogram.other, JSON.stringify(histogram)).toEqual([])
      // One process alone would allow all 40. The shared window has to reject
      // some. A couple may fall back to memory if a lock outlasts the short budget.
      expect(histogram['429'], JSON.stringify(histogram)).toBeGreaterThanOrEqual(8)
      expect(histogram['200'], JSON.stringify(histogram)).toBeLessThanOrEqual(ACTION_LIMITS.result.limit + 2)
      expect(histogram['200'] + histogram['429'], JSON.stringify(histogram)).toBe(total)
    } finally {
      await Promise.all(Object.values(contexts).map((context) => context.dispose()))
    }
  } finally {
    peer.child.kill('SIGTERM')
  }
})
