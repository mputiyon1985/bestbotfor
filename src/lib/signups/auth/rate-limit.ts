export function failureDelayMs(raw = process.env.SIGNUPS_LOGIN_FAILURE_DELAY_MS): number {
  if (raw === undefined || raw === '') return 800
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return 800
  return Math.min(value, 5_000)
}

export async function waitForFailureDelay(): Promise<void> {
  const delay = failureDelayMs()
  if (delay === 0) return
  await new Promise((resolve) => setTimeout(resolve, delay))
}
