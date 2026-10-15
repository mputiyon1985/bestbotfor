export class DeadlineError extends Error {
  constructor() {
    super('deadline')
    this.name = 'DeadlineError'
  }
}

/**
 * Rejects when `work` is still pending after `ms`.
 * The original promise stays observed, so a rejection that arrives after the
 * deadline does not surface as an unhandled rejection.
 */
export function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineError()), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error('failed'))
      },
    )
  })
}
