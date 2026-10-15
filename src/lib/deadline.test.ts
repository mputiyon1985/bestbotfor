import { describe, expect, it } from 'vitest'
import { withDeadline } from './deadline'

describe('withDeadline', () => {
  it('observes a rejection that arrives after the deadline', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)
    const late = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('late')), 40)
    })
    await expect(withDeadline(late, 10)).rejects.toThrow('deadline')
    await new Promise((resolve) => setTimeout(resolve, 80))
    process.off('unhandledRejection', onUnhandled)
    expect(unhandled).toEqual([])
  })
})
