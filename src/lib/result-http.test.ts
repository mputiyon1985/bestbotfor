import { describe, expect, it } from 'vitest'
import { notFoundDescription, notFoundTitle } from './metadata'
import { resultMissMetadata, resultNotFoundHtml, resultNotFoundHeaders, resultRateLimitHeaders, resultRateLimitHtml } from './result-http'

function robotsDirectives(html: string): string[] {
  return [...html.matchAll(/<meta\b[^>]*>/gi)]
    .filter((match) => /name=["']robots["']/i.test(match[0]))
    .map((match) => match[0].match(/content=["']([^"']*)["']/i)?.[1] ?? '')
}

describe('result HTTP responses', () => {
  it('sends one robots meta on a result 404', () => {
    const html = resultNotFoundHtml()
    expect(robotsDirectives(html)).toEqual(['noindex, nofollow'])
    expect(html).toContain(notFoundTitle)
    expect(html).toContain('Page not found')
    expect(html).toContain(notFoundDescription)
    expect(html).not.toContain('rel="canonical"')
    expect(resultNotFoundHeaders()['x-robots-tag']).toBe('noindex, nofollow')
    expect(resultMissMetadata().robots).toEqual({ index: false, follow: false })
    expect(Array.isArray(resultMissMetadata().robots)).toBe(false)
  })

  it('answers a tripped limit with 429 headers and Retry-After', () => {
    const headers = resultRateLimitHeaders(5_000, 1_000)
    expect(headers['retry-after']).toBe('4')
    expect(headers['x-robots-tag']).toBe('noindex, nofollow')
    const html = resultRateLimitHtml()
    expect(robotsDirectives(html)).toEqual(['noindex, nofollow'])
    expect(html).toContain('Too many results')
    expect(html).toContain('This network has asked for too many picks.')
  })
})
