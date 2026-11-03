import { describe, expect, it } from 'vitest'
import {
  ABSOLUTE_RETRY_SAMPLES,
  ABSOLUTE_SAMPLES,
  absolutePerformanceError,
  absoluteRetryTargets,
  homeLcpError,
  homeTbtError,
  median,
  performanceErrors,
  pullRequestFirst,
} from './lighthouse-gate'

describe('lighthouse gate', () => {
  it('passes a slow runner when main is equally slow, and fails a score under main', () => {
    expect(performanceErrors('/best/coding', [0.94, 0.94, 0.94], [0.94, 0.94, 0.94])).toEqual([])
    expect(performanceErrors('/best/coding', [0.93, 0.93, 0.93], [0.94, 0.94, 0.94]).length).toBeGreaterThan(0)
    expect(performanceErrors('/tools/chatgpt', [0.94, 0.93, 0.97], [0.98, 0.97, 0.97]).length).toBeGreaterThan(0)
    expect(performanceErrors('/result', [0.89, 0.89, 0.89], [0.89, 0.89, 0.89]).length).toBeGreaterThan(0)
  })

  it('keeps the 229ms home TBT cap, a 250ms ceiling, and a match against a noisier main', () => {
    expect(median([275, 240, 250.5])).toBe(250.5)
    expect(homeTbtError([240, 240, 240], [240, 240, 240])).toBeNull()
    expect(homeTbtError([251, 251, 251], [280, 280, 280])).toMatch(/250/)
    expect(homeTbtError([240, 250, 275], [143, 152, 179])).toMatch(/229/)
    expect(homeTbtError([180, 190, 200], [143, 152, 179])).toBeNull()
    expect(homeTbtError([230, 230, 230], null)).toMatch(/229/)
  })

  it('keeps the best LCP cap at 2099ms', () => {
    expect(homeLcpError([1921, 1894, 2442])).toBeNull()
    expect(homeLcpError([2400, 2500, 2600])).toMatch(/2099/)
  })

  it('medians every absolute sample, including the retry, and alternates pair order', () => {
    expect(ABSOLUTE_SAMPLES).toBe(5)
    expect(ABSOLUTE_RETRY_SAMPLES).toBe(5)
    const firstPass = [0.94, 0.94, 0.94, 0.94, 0.94]
    expect(absolutePerformanceError('/best/coding', firstPass)).toMatch(/0.94/)
    const retried = [...firstPass, 0.98, 0.98, 0.98, 0.98, 0.98]
    expect(median(retried)).toBeCloseTo(0.96)
    expect(absolutePerformanceError('/best/coding', retried)).toBeNull()
    expect(absolutePerformanceError('/best/coding', [...firstPass, 0.94, 0.94, 0.94, 0.94, 0.94])).toMatch(/0.94/)
    expect(homeTbtError([275, 240, 250.5, 275, 260], null)).toMatch(/229/)
    expect(homeTbtError([275, 240, 250.5, 275, 260, 140, 150, 160, 170, 180], null)).toBeNull()
    expect(pullRequestFirst(0)).toBe(true)
    expect(pullRequestFirst(1)).toBe(false)
    const pages = ['/', '/best/coding', '/tools/chatgpt']
    const quiz = ['/result?task=chat&view=all']
    expect(absoluteRetryTargets(['/best/coding performance median 0.94 is under 0.95'], pages, quiz)).toEqual({
      pages: ['/best/coding'],
      quiz: [],
      home: false,
    })
    expect(absoluteRetryTargets(['/ performance median 0.94 is under 0.95'], pages, quiz).pages).toEqual(['/'])
    expect(
      absoluteRetryTargets(['/tools/chatgpt performance median 0.94 is under 0.95'], ['/tools', '/tools/chatgpt'], quiz).pages,
    ).toEqual(['/tools/chatgpt'])
    expect(absoluteRetryTargets(['home TBT median 250.5ms is over 229ms'], pages, quiz)).toEqual({
      pages: [],
      quiz: [],
      home: true,
    })
  })
})