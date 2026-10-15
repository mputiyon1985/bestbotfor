export class DeadlineError extends Error {
  constructor() {
    super('deadline')
    this.name = 'DeadlineError'
  }
}

/** Rejects when `work` is still pending after `ms`. The original promise is left running. */
export function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError()), ms)
  })
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}
