const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 8
const MAX_BUCKETS = 10_000

type Bucket = { failures: number; windowStart: number }

const buckets = new Map<string, Bucket>()

export function resetRateLimitsForTests(): void {
  buckets.clear()
}

export function failureDelayMs(raw = process.env.SIGNUPS_LOGIN_FAILURE_DELAY_MS): number {
  if (raw === undefined || raw === '') return 800
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return 800
  return Math.min(value, 5_000)
}

export function isRateLimited(key: string, now = Date.now()): boolean {
  const bucket = buckets.get(key)
  if (!bucket) return false
  if (now - bucket.windowStart > WINDOW_MS) {
    buckets.delete(key)
    return false
  }
  return bucket.failures >= MAX_FAILURES
}

export function recordFailure(key: string, now = Date.now()): void {
  const bucket = buckets.get(key)
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    if (buckets.size >= MAX_BUCKETS) {
      const oldest = buckets.keys().next().value
      if (oldest) buckets.delete(oldest)
    }
    buckets.set(key, { failures: 1, windowStart: now })
    return
  }
  bucket.failures += 1
}

export function clearFailures(key: string): void {
  buckets.delete(key)
}

export async function waitForFailureDelay(): Promise<void> {
  const delay = failureDelayMs()
  if (delay === 0) return
  await new Promise((resolve) => setTimeout(resolve, delay))
}
