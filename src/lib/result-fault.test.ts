import { describe, expect, it } from 'vitest'
import { acceptResultFault, faultedResultWork } from './result-fault'

describe('result fault injection', () => {
  it('denies the header in production even when NODE_ENV is test and RESULT_FAULTS is set', () => {
    for (const header of ['lookup-throw', 'lookup-slow', 'limit-throw', 'limit-slow', 'db-down']) {
      expect(acceptResultFault(header, { faults: '1', vercelEnv: 'production', nodeEnv: 'test' }), header).toBe('')
      expect(acceptResultFault(header, { faults: '1', vercelEnv: ' production ', nodeEnv: 'production' }), header).toBe('')
    }
  })

  it('denies preview, production, and an unset env even when RESULT_FAULTS=1', () => {
    for (const vercelEnv of [undefined, '', 'preview', 'staging', 'Production']) {
      expect(acceptResultFault('lookup-throw', { faults: '1', vercelEnv, nodeEnv: 'production' }), String(vercelEnv)).toBe('')
      expect(acceptResultFault('db-down', { faults: '1', vercelEnv, nodeEnv: 'test' }), String(vercelEnv)).toBe('')
    }
    expect(acceptResultFault('lookup-throw', { faults: '1', nodeEnv: 'test' })).toBe('')
    expect(acceptResultFault('lookup-throw', { faults: undefined, vercelEnv: 'test', nodeEnv: 'production' })).toBe('')
    expect(acceptResultFault('lookup-throw', { faults: '0', vercelEnv: 'development', nodeEnv: 'test' })).toBe('')
  })

  it('honors a known fault only when VERCEL_ENV is development or test and RESULT_FAULTS=1', () => {
    expect(acceptResultFault('lookup-throw', { faults: '1', vercelEnv: 'development', nodeEnv: 'production' })).toBe('lookup-throw')
    expect(acceptResultFault('db-down', { faults: '1', vercelEnv: 'test', nodeEnv: 'production' })).toBe('db-down')
    expect(acceptResultFault(' lookup-slow ', { faults: '1', vercelEnv: 'test' })).toBe('lookup-slow')
    expect(acceptResultFault('not-a-fault', { faults: '1', vercelEnv: 'development' })).toBe('')
    expect(acceptResultFault(null, { faults: '1', vercelEnv: 'test' })).toBe('')
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
