import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SponsorPageCta } from '@/components/sponsor-page-cta'
import { SponsorForm } from '@/components/sponsor-form'
import { readFileSync } from 'node:fs'
import { foundingCapPhrase, sponsorPageHref } from './sponsor-page-cta'

describe('sponsor page CTA', () => {
  it('caches the founding count for 60 seconds and drops that cache after a founding payment', () => {
    const availability = readFileSync('src/lib/sponsor-availability.ts', 'utf8')
    expect(availability).toContain('FOUNDING_SPOTS_REVALIDATE_SECONDS = 60')
    expect(availability).toContain('revalidate: FOUNDING_SPOTS_REVALIDATE_SECONDS')
    expect(availability).toContain('tags: [FOUNDING_SPOTS_CACHE_TAG]')
    expect(availability).toContain('revalidateTag(FOUNDING_SPOTS_CACHE_TAG, { expire: 0 })')
    const webhook = readFileSync('src/lib/stripe-webhook.ts', 'utf8')
    expect(webhook).toContain('revalidateFoundingSpots()')
    const hub = readFileSync('src/app/best/page.tsx', 'utf8')
    const list = hub.indexOf('aria-label="Jobs"')
    const cta = hub.indexOf('<SponsorPageCta')
    expect(list).toBeGreaterThan(0)
    expect(cta).toBeGreaterThan(list)
  })

  it('links both labels to /sponsor and keeps a task slug on the query', () => {
    expect(sponsorPageHref('coding')).toBe('/sponsor?task=coding')
    expect(sponsorPageHref('chat-assistant')).toBe('/sponsor?task=chat-assistant')
    expect(sponsorPageHref(null)).toBe('/sponsor')
    expect(sponsorPageHref('')).toBe('/sponsor')
    expect(sponsorPageHref('../admin')).toBe('/sponsor')
    expect(sponsorPageHref('coding?x=1')).toBe('/sponsor')
    expect(sponsorPageHref('https://buy.stripe.com/4gMdRa7vW8G6gg2ebyfrW02')).toBe('/sponsor')

    const html = renderToStaticMarkup(createElement(SponsorPageCta, { taskSlug: 'coding' }))
    expect(html).toContain('Sponsor this page')
    expect(html).toContain('Get featured here')
    expect(html).toContain('href="/sponsor?task=coding"')
    expect(html).toContain('href="/disclosure"')
    expect(html).toContain('$99')
    expect(html).toContain('$299/mo')
    expect(html).toContain('limited to 5')
    expect(foundingCapPhrase(null)).toBe('limited to 5')
    expect(foundingCapPhrase(0)).toBe('all 5 founding spots are taken')
    expect(foundingCapPhrase(2)).toBe('2 of 5 founding spots left')
    const soldOut = renderToStaticMarkup(createElement(SponsorPageCta, { taskSlug: 'coding', foundingSpotsLeft: 0 }))
    expect(soldOut).toContain('all 5 founding spots are taken')
    expect(soldOut).not.toContain('limited to 5')
    expect(html).not.toContain('buy.stripe.com')
    expect(html).not.toContain('bg-mist')
    expect(html).not.toContain('<script')
  })

  it('pre-selects the task the CTA asked for and ignores a task that is not listed', () => {
    const tasks = [
      { slug: 'coding', name: 'Coding' },
      { slug: 'seo', name: 'SEO' },
    ]
    const offerings = [
      {
        id: 'placement_weekly',
        title: 'Featured placement for one week',
        summary: '',
        priceLabel: '',
        notice: '',
        target: 'task' as const,
        available: false,
      },
    ]
    const selected = renderToStaticMarkup(createElement(SponsorForm, { offerings, tasks, initialTask: 'seo' }))
    expect(selected).toContain('<option value="seo" selected="">SEO</option>')
    const ignored = renderToStaticMarkup(createElement(SponsorForm, { offerings, tasks, initialTask: '../admin' }))
    expect(ignored).toContain('<option value="" selected="">Choose a /best page</option>')
    expect(ignored).not.toContain('<option value="seo" selected="">')
  })
})
