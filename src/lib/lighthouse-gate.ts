/** Cap from main before the Lighthouse noise change. Not 250 or 300. */
export const HOME_TBT_CAP_MS = 229

/**
 * Hard ceiling for a PR even when it is only matching main.
 * Mark can change this.
 */
export const HOME_TBT_HARD_CEILING_MS = 250

/** Best of the home runs. The 2.1s budget was set against the quiet LCP cluster. */
export const HOME_LCP_CAP_MS = 2099

export const PERFORMANCE_MEDIAN_MIN = 0.95

/**
 * A healthy main still requires the PR to clear 0.95, because the PR median
 * may not sit more than 0.02 below main. 0.90 is the absolute floor for a
 * runner that cannot reach 0.95 on main either.
 */
export const PERFORMANCE_FLOOR = 0.9

export const PERFORMANCE_DELTA = 0.02

/** Main pushes and the nightly run median this many samples per URL. */
export const ABSOLUTE_SAMPLES = 5

/** On a miss, absolute mode adds this many samples and medians the whole set. */
export const ABSOLUTE_RETRY_SAMPLES = 5

/** Printed from the copy that actually executed, so CI can see which gate ran. */
export const LIGHTHOUSE_GATE_COPY = 'origin/main worktree'

/**
 * Even pairs measure the pull request first. Odd pairs measure main first.
 * Pair 0 is PR then main, pair 1 is main then PR.
 */
export function pullRequestFirst(pairIndex: number): boolean {
  return pairIndex % 2 === 0
}

/**
 * URLs to measure again after an absolute miss.
 * A leading `/` must not swallow `/best/coding`.
 */
export function absoluteRetryTargets(
  messages: string[],
  pages: readonly string[],
  quiz: readonly string[],
): { pages: string[]; quiz: string[]; home: boolean } {
  const pageHits: string[] = []
  const quizHits: string[] = []
  let home = false
  for (const message of messages) {
    if (message.startsWith('home TBT') || message.startsWith('home LCP')) home = true
    for (const url of pages) {
      if (message.startsWith(`${url} `)) pageHits.push(url)
    }
    for (const url of quiz) {
      if (message.startsWith(`${url} `)) quizHits.push(url)
    }
  }
  return {
    pages: [...new Set(pageHits)],
    quiz: [...new Set(quizHits)],
    home,
  }
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median of no values')
  for (const value of values) {
    if (!Number.isFinite(value)) throw new Error('median of a non-finite value')
  }
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.floor((sorted.length - 1) / 2)
  const lower = sorted[index]
  if (lower === undefined) throw new Error('median index missing')
  if (sorted.length % 2 === 1) return lower
  const upper = sorted[index + 1]
  if (upper === undefined) throw new Error('median upper index missing')
  return (lower + upper) / 2
}

export function absolutePerformanceError(url: string, samples: number[]): string | null {
  const value = median(samples)
  if (value >= PERFORMANCE_MEDIAN_MIN) return null
  return `${url} performance median ${value.toFixed(2)} is under ${PERFORMANCE_MEDIAN_MIN.toFixed(2)}`
}

export function performanceErrors(url: string, pr: number[], main: number[]): string[] {
  const prMedian = median(pr)
  const mainMedian = median(main)
  const errors: string[] = []
  if (prMedian < PERFORMANCE_FLOOR) {
    errors.push(`${url} performance median ${prMedian.toFixed(2)} is under ${PERFORMANCE_FLOOR.toFixed(2)}`)
  }
  if (mainMedian < PERFORMANCE_MEDIAN_MIN) {
    if (prMedian < mainMedian) {
      errors.push(`${url} performance median ${prMedian.toFixed(2)} is below main ${mainMedian.toFixed(2)}`)
    }
  } else if (mainMedian - prMedian > PERFORMANCE_DELTA) {
    errors.push(
      `${url} performance median ${prMedian.toFixed(2)} is more than ${PERFORMANCE_DELTA} below main ${mainMedian.toFixed(2)}`,
    )
  }
  if (mainMedian >= PERFORMANCE_MEDIAN_MIN && prMedian < PERFORMANCE_MEDIAN_MIN) {
    errors.push(`${url} performance median ${prMedian.toFixed(2)} is under 0.95 while main is ${mainMedian.toFixed(2)}`)
  }
  return errors
}

/**
 * On main, the median must be at most 229ms.
 * On a PR, 229 still binds when main is at or under it. A noisier main can be
 * matched, but not past HOME_TBT_HARD_CEILING_MS.
 */
export function homeTbtError(pr: number[], main: number[] | null): string | null {
  const prMedian = median(pr)
  if (!main) {
    if (prMedian <= HOME_TBT_CAP_MS) return null
    return `home TBT median ${prMedian.toFixed(1)}ms is over ${HOME_TBT_CAP_MS}ms`
  }
  const mainMedian = median(main)
  const cap = Math.min(HOME_TBT_HARD_CEILING_MS, Math.max(HOME_TBT_CAP_MS, mainMedian))
  if (prMedian <= cap) return null
  return `home TBT median ${prMedian.toFixed(1)}ms is over ${cap.toFixed(1)}ms (cap ${HOME_TBT_CAP_MS}ms, ceiling ${HOME_TBT_HARD_CEILING_MS}ms, main median ${mainMedian.toFixed(1)}ms)`
}

export function homeLcpError(samples: number[]): string | null {
  if (samples.length === 0) throw new Error('LCP of no values')
  for (const sample of samples) {
    if (!Number.isFinite(sample)) throw new Error('LCP is not a finite number')
  }
  const best = Math.min(...samples)
  if (best <= HOME_LCP_CAP_MS) return null
  return `home LCP best ${best.toFixed(0)}ms is over ${HOME_LCP_CAP_MS}ms`
}

const CATEGORY_MEDIAN_MIN = 0.95

function categoryMedianError(url: string, name: string, samples: number[]): string | null {
  const value = median(samples)
  if (value < CATEGORY_MEDIAN_MIN) return `${url} ${name} median ${value.toFixed(2)} is under 0.95`
  return null
}

/** Accessibility, best-practices, and SEO on a pull request. A non-finite sample throws. */
export function pullRequestCategoryError(url: string, name: string, samples: number[]): string | null {
  return categoryMedianError(url, name, samples)
}

/** Accessibility, best-practices, and SEO on a main push or nightly run. A non-finite sample throws. */
export function absoluteCategoryError(url: string, name: string, samples: number[]): string | null {
  return categoryMedianError(url, name, samples)
}

export type LighthouseMetricInput = {
  performance: number | null | undefined
  accessibility: number | null | undefined
  bestPractices: number | null | undefined
  seo: number | null | undefined
  lcp: number | null | undefined
  tbt: number | null | undefined
}

function finiteMetric(name: string, value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Lighthouse ${name} is not a finite number`)
  }
  return value
}

/** A null or missing Lighthouse score is a failed run, not a pass. */
export function readLighthouseMetrics(metrics: LighthouseMetricInput): {
  performance: number
  accessibility: number
  bestPractices: number
  seo: number
  lcp: number
  tbt: number
} {
  return {
    performance: finiteMetric('performance', metrics.performance),
    accessibility: finiteMetric('accessibility', metrics.accessibility),
    bestPractices: finiteMetric('best-practices', metrics.bestPractices),
    seo: finiteMetric('seo', metrics.seo),
    lcp: finiteMetric('LCP', metrics.lcp),
    tbt: finiteMetric('TBT', metrics.tbt),
  }
}
