import { describe, expect, it } from 'vitest'
import { homeLcpError, homeTbtError, median, performanceErrors } from './lighthouse-gate'

describe('lighthouse gate', () => {
  it('passes a slow runner when main is equally slow, and fails a real drop', () => {
    expect(performanceErrors('/best/coding', [0.94, 0.94, 0.98], [0.94, 0.94, 0.95])).toEqual([])
    expect(performanceErrors('/tools/chatgpt', [0.94, 0.93, 0.97], [0.98, 0.97, 0.97]).length).toBeGreaterThan(0)
    expect(performanceErrors('/result', [0.89, 0.89, 0.89], [0.89, 0.89, 0.89]).length).toBeGreaterThan(0)
  })

  it('keeps the 229ms home TBT cap and lets the PR match a noisier main', () => {
    expect(median([275, 240, 250.5])).toBe(250.5)
    expect(homeTbtError([275, 240, 250.5], [270, 245, 255])).toBeNull()
    expect(homeTbtError([240, 250, 275], [143, 152, 179])).toMatch(/229/)
    expect(homeTbtError([180, 190, 200], [143, 152, 179])).toBeNull()
  })

  it('keeps the best-of-three LCP cap at 2099ms', () => {
    expect(homeLcpError([1921, 1894, 2442])).toBeNull()
    expect(homeLcpError([2400, 2500, 2600])).toMatch(/2099/)
  })
})