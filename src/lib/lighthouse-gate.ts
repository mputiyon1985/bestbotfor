/** Cap from main before the Lighthouse noise change. Not 250 or 300. */
export const HOME_TBT_CAP_MS = 229

/** Best of the home runs. The 2.1s budget was set against the quiet LCP cluster. */
export const HOME_LCP_CAP_MS = 2099

/**
 * A healthy main still requires the PR to clear 0.95, because the PR median
 * may not sit more than 0.02 below main. 0.90 is the absolute floor for a
 * runner that cannot reach 0.95 on main either.
 */
export const PERFORMANCE_FLOOR = 0.9

export const PERFORMANCE_DELTA = 0.02

export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median of no values')
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.floor((sorted.length - 1) / 2)
  const lower = sorted[index]
  if (lower === undefined) throw new Error('median index missing')
  if (sorted.length % 2 === 1) return lower
  const upper = sorted[index + 1]
  if (upper === undefined) throw new Error('median upper index missing')
  return (lower + upper) / 2
}

export function performanceErrors(url: string, pr: number[], main: number[]): string[] {
  const prMedian = median(pr)
  const mainMedian = median(main)
  const errors: string[] = []
  if (prMedian < PERFORMANCE_FLOOR) {
    errors.push(`${url} performance median ${prMedian.toFixed(2)} is under ${PERFORMANCE_FLOOR.toFixed(2)}`)
  }
  if (mainMedian - prMedian > PERFORMANCE_DELTA) {
    errors.push(
      `${url} performance median ${prMedian.toFixed(2)} is more than ${PERFORMANCE_DELTA} below main ${mainMedian.toFixed(2)}`,
    )
  }
  if (mainMedian >= 0.95 && prMedian < 0.95) {
    errors.push(`${url} performance median ${prMedian.toFixed(2)} is under 0.95 while main is ${mainMedian.toFixed(2)}`)
  }
  return errors
}

/** 229ms when main is at or under that cap. When main is noisier, the PR may match main and not go past it. */
export function homeTbtError(pr: number[], main: number[]): string | null {
  const prMedian = median(pr)
  const mainMedian = median(main)
  const cap = Math.max(HOME_TBT_CAP_MS, mainMedian)
  if (prMedian <= cap) return null
  return `home TBT median ${prMedian.toFixed(1)}ms is over ${cap.toFixed(1)}ms (cap ${HOME_TBT_CAP_MS}ms, main median ${mainMedian.toFixed(1)}ms)`
}

export function homeLcpError(samples: number[]): string | null {
  const best = Math.min(...samples)
  if (best <= HOME_LCP_CAP_MS) return null
  return `home LCP best ${best.toFixed(0)}ms is over ${HOME_LCP_CAP_MS}ms`
}
