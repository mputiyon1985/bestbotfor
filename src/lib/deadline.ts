/**
 * Bound a database call so a cold remote connection cannot hold the response
 * open. The original promise is still observed, so a late rejection is not
 * unhandled after the deadline wins.
 */
export function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('deadline')), ms)
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

export function isDeadline(error: unknown): boolean {
  return error instanceof Error && error.message === 'deadline'
}
