import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import DisclosurePage from '@/app/disclosure/page'
import { toolSeeds } from '@/data/catalog'
import { officialHttpsUrl } from './redirect'
import { overallScore } from './editorial'
import { rankTools, type ScoreableTool } from './scoring'
import {
  ACTIVE_AFFILIATE_STATUS,
  APPROVED_ACTIVE_AFFILIATES,
  PREPARED_AFFILIATE_SLUGS,
  affiliateAdminRows,
  affiliateSeedValues,
} from './affiliate-admin'
import { affiliateSubIdParam, withAffiliateSubId } from './affiliate-subid'
import { AFFILIATE_BUTTON_NOTE, AFFILIATE_PAGE_NOTICE, DISCLOSURE_UPDATED } from './affiliate-copy'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('prepared affiliate programs stay off', () => {
  it('ships no active program and no tracking link', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual([])
    for (const tool of toolSeeds) {
      expect(tool.affiliate.status, tool.slug).not.toBe(ACTIVE_AFFILIATE_STATUS)
      expect(tool.affiliate.affiliateUrl ?? null, tool.slug).toBeNull()
      expect(affiliateSeedValues(tool), tool.slug).toEqual({ status: tool.affiliate.status, affiliateUrl: null })
    }
    for (const slug of PREPARED_AFFILIATE_SLUGS) {
      const tool = toolSeeds.find((item) => item.slug === slug)
      expect(tool, slug).toBeTruthy()
      expect(tool?.affiliate.status).toBe('inactive')
      expect(tool?.affiliate.hasProgram).toBe(true)
    }
    const catalog = read('src/data/catalog.ts')
    expect(catalog).not.toContain('8hbaa9knuwda')
    expect(catalog).not.toContain('mark-putiyon')
    expect(catalog).not.toContain('refer.papermark.com/mark')
  })

  it('refuses to seed an active program or a URL until that slug is approved', () => {
    expect(() =>
      affiliateSeedValues({
        slug: 'elevenlabs',
        affiliate: { hasProgram: true, network: 'PartnerStack', sourceUrl: null, status: 'active', commissionNote: null, affiliateUrl: 'https://partnerstack.com/x' },
      }),
    ).toThrow(/owner approval/)
    expect(() =>
      affiliateSeedValues({
        slug: 'elevenlabs',
        affiliate: { hasProgram: true, network: 'PartnerStack', sourceUrl: null, status: 'inactive', commissionNote: null, affiliateUrl: 'https://partnerstack.com/x' },
      }),
    ).toThrow(/affiliate URL/)
  })

  it('lists prepared programs for the read-only admin page without the tracking URL', () => {
    const rows = affiliateAdminRows(toolSeeds)
    for (const slug of PREPARED_AFFILIATE_SLUGS) {
      const row = rows.find((item) => item.slug === slug)
      expect(row?.status).toBe('inactive')
      expect(row?.hasUrl).toBe(false)
      expect(row?.prepared).toBe(true)
      expect(row).not.toHaveProperty('affiliateUrl')
    }
    expect(read('src/app/admin/affiliates/page.tsx')).toContain('Read-only')
    expect(read('src/app/admin/affiliates/page.tsx')).not.toContain('action=')
  })
})

describe('score and ranking ignore affiliate fields', () => {
  it('does not read affiliate or commission fields in the score or rank functions', () => {
    const banned = /\b(affiliateUrl|affiliate_url|commissionNote|commission_note|hasProgram|affiliatePrograms|programId|program_id)\b/
    for (const file of ['src/lib/scoring.ts', 'src/lib/editorial.ts']) {
      expect(read(file), file).not.toMatch(banned)
    }
  })

  it('ranks and scores the same tool whether or not affiliate fields are attached', () => {
    const base = {
      slug: 'alpha',
      name: 'Alpha',
      skillLevel: 'beginner' as const,
      pricingModel: 'freemium' as const,
      hasFreeTier: true,
      priceFromUsd: 20,
      fitScore: 80,
      notes: 'A fit note.',
    }
    const withMoney = {
      ...base,
      slug: 'beta',
      name: 'Beta',
      affiliateUrl: 'https://partnerstack.com/x',
      commissionNote: '50% forever',
      hasProgram: true,
      status: 'active',
      programId: 9,
    }
    const ranked = rankTools([withMoney, base], { budget: 'any', skill: 'beginner' })
    expect(ranked.map((item) => item.score)).toEqual([ranked[0]?.score, ranked[0]?.score])
    expect(ranked.map((item) => item.slug).sort()).toEqual(['alpha', 'beta'])
    const rubric = { features: 4, value: 4, ease: 5, quality: 4 }
    expect(overallScore(rubric)).toBe(overallScore({ ...rubric, affiliateUrl: 'https://example.com', commissionNote: '20%' } as typeof rubric))
    const picks = rankTools([base satisfies ScoreableTool], { budget: 'low', skill: 'beginner' })
    expect(picks[0]?.score).toBe(base.fitScore + (picks[0]?.budgetDelta ?? 0) + (picks[0]?.skillDelta ?? 0))
  })
})

describe('affiliate disclosure and ops', () => {
  it('states the commission line, lists the partner tools, and dates the disclosure', () => {
    const page = read('src/app/disclosure/page.tsx')
    expect(page).toContain('DISCLOSURE_UPDATED')
    expect(page).toContain('Some Visit links are affiliate links')
    expect(page).toContain('at no extra cost to you')
    expect(page).toContain('never affect rankings or scores')
    const html = renderToStaticMarkup(createElement(DisclosurePage))
    expect(html).toContain(DISCLOSURE_UPDATED)
    expect(html).toContain('switched off')
    for (const name of ['ElevenLabs', 'Synthesia', 'Descript', 'Murf', 'Papermark', 'Writesonic', 'Lovable']) {
      expect(html).toContain(name)
    }
    for (const file of ['src/app/best/[task]/page.tsx', 'src/app/tools/[slug]/page.tsx', 'src/app/result/page.tsx']) {
      expect(read(file)).toContain('AffiliatePageNotice')
    }
    expect(AFFILIATE_PAGE_NOTICE).toContain('at no extra cost to you')
    expect(AFFILIATE_BUTTON_NOTE).toBe('Affiliate link: we may earn a commission.')
  })

  it('tells the privacy page about SubIDs and network cookies', () => {
    const paragraph = read('src/lib/privacy-copy.ts')
    expect(paragraph).toContain('AFFILIATE_TRACKING_PARAGRAPH')
    expect(paragraph).toContain('sub-id')
    expect(paragraph).toContain('cookie')
    expect(read('src/app/privacy/page.tsx')).toContain('AFFILIATE_TRACKING_PARAGRAPH')
  })

  it('keeps the no-paid-search rule in the repo', () => {
    const note = read('docs/runbooks/affiliate-programs.md')
    expect(note.toLowerCase()).toContain('does not run paid search')
    expect(note.toLowerCase()).toContain('brand')
  })
})

describe('SubIDs', () => {
  it('uses the network parameter and will not replace a host', () => {
    expect(affiliateSubIdParam('PartnerStack')).toBe('sid')
    expect(affiliateSubIdParam('Impact')).toBe('subId1')
    expect(affiliateSubIdParam('Dub')).toBe('externalId')
    expect(affiliateSubIdParam('Rewardful')).toBeNull()
    expect(affiliateSubIdParam('Papermark')).toBeNull()
    const next = withAffiliateSubId('https://partnerstack.com/click?p=1', 'sid', '/best/voice.42')
    const url = new URL(next)
    expect(url.hostname).toBe('partnerstack.com')
    expect(url.searchParams.get('sid')).toBe('/best/voice.42')
    expect(url.searchParams.get('p')).toBe('1')
    expect(withAffiliateSubId(next, 'sid', '/other.1')).toBe(next)
    expect(withAffiliateSubId('https://partnerstack.com/click', 'sid', 'https://evil.example')).toBe('https://partnerstack.com/click')
    expect(officialHttpsUrl('https://evil.example', ['partnerstack.com'])).toBeNull()
  })
})
