import { describe, expect, it } from 'vitest'
import { acceptResultFault, faultedResultWork } from './result-fault'

describe('result fault injection', () => {
  it('ignores the header and RESULT_FAULTS when VERCEL_ENV is production', () => {
    for (const header of ['lookup-throw', 'lookup-slow', 'limit-throw', 'limit-slow', 'db-down', 'lookup-throw ']) {
      expect(acceptResultFault(header, { faults: '1', vercelEnv: 'production' }), header).toBe('')
      expect(acceptResultFault(header, { faults: '1', vercelEnv: ' production ' }), header).toBe('')
    }
    expect(acceptResultFault('db-down', { faults: '1', vercelEnv: 'production' })).toBe('')
  })

  it('honors a known fault only when RESULT_FAULTS=1 and this is not production', () => {
    for (const vercelEnv of [undefined, '', 'preview', 'development']) {
      expect(acceptResultFault('lookup-throw', { faults: '1', vercelEnv }), String(vercelEnv)).toBe('lookup-throw')
      expect(acceptResultFault('db-down', { faults: '1', vercelEnv }), String(vercelEnv)).toBe('db-down')
      expect(acceptResultFault('lookup-throw', { faults: undefined, vercelEnv }), String(vercelEnv)).toBe('')
      expect(acceptResultFault('lookup-throw', { faults: '0', vercelEnv }), String(vercelEnv)).toBe('')
    }
    expect(acceptResultFault('not-a-fault', { faults: '1', vercelEnv: 'preview' })).toBe('')
    expect(acceptResultFault(null, { faults: '1', vercelEnv: 'preview' })).toBe('')
  })

  it('fails the page read only for db-down, and leaves a normal read alone', async () => {
    const real = async () => 'ok' as const
    await expect(faultedResultWork('lookup-throw', 'lookup', real)()).rejects.toThrow('fault')
    await expect(faultedResultWork('lookup-throw', 'page', real)()).resolves.toBe('ok')
    await expect(faultedResultWork('db-down', 'lookup', real)()).rejects.toThrow('fault')
    await expect(faultedResultWork('db-down', 'page', real)()).rejects.toThrow('fault')
    await expect(faultedResultWork('', 'lookup', real)()).resolves.toBe('ok')
    await expect(faultedResultWork('', 'page', real)()).resolves.toBe('ok')
    await expect(faultedResultWork('limit-throw', 'limit', async () => ({ ok: true, resetAt: 0 }))()).rejects.toThrow('fault')
    await expect(faultedResultWork('limit-throw', 'lookup', real)()).resolves.toBe('ok')
  })
})
