import { describe, expect, it } from 'vitest'
import { analyticsPageView, googleAnalyticsBootstrap, redactAnalyticsUrl } from './analytics-page'

describe('analytics page views', () => {
  it('strips the search query so typed text never reaches GA', () => {
    const view = analyticsPageView({
      href: 'https://bestbotfor.com/search?q=private%20launch%20plan',
      referrer: 'https://bestbotfor.com/search?q=earlier%20note',
    })
    expect(view.page_location).toBe('https://bestbotfor.com/search')
    expect(view.page_path).toBe('/search')
    expect(view.page_referrer).toBe('https://bestbotfor.com/search')
    expect(JSON.stringify(view)).not.toContain('private')
    expect(JSON.stringify(view)).not.toContain('earlier')
    expect(JSON.stringify(view)).not.toContain('q=')
  })

  it('strips q from any path and keeps other parameters', () => {
    expect(redactAnalyticsUrl('https://bestbotfor.com/result?task=chat&q=secret&budget=any')).toBe(
      'https://bestbotfor.com/result?task=chat&budget=any',
    )
    expect(redactAnalyticsUrl('https://bestbotfor.com/search?Q=Secret&q=again')).toBe('https://bestbotfor.com/search')
  })

  it('turns off the automatic page view that would include the address bar', () => {
    const script = googleAnalyticsBootstrap('G-TEST123')
    expect(script).toContain("send_page_view: false")
    expect(script).not.toContain('page_location')
  })

  it('leaves catalog filters that are not free text', () => {
    const view = analyticsPageView({
      href: 'https://bestbotfor.com/result?task=chat&budget=any&skill=beginner',
    })
    expect(view.page_path).toBe('/result?task=chat&budget=any&skill=beginner')
  })
})
