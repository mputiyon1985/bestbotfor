import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import DisclosurePage from '@/app/disclosure/page'
import { toolSeeds } from '@/data/catalog'
import { officialHttpsUrl } from './redirect'
import { overallScore } from './editorial'
import { recommend, toolsForTask } from './recommend'
import { rankTools, type ScoreableTool } from './scoring'
import type { Catalog, CatalogTool } from './catalog-types'
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

const LIVE_AFFILIATE_URLS = {
  elevenlabs: 'https://try.elevenlabs.io/8hbaa9knuwda',
  synthesia: 'https://www.synthesia.io?via=mark-putiyon',
  descript: 'https://get.descript.com/mr4pi3y6tp4s',
  murf: 'https://get.murf.ai/pxci5cc1lpk2',
  papermark: 'https://refer.papermark.com/mark',
  docsalot: 'https://docsalot.dev/?utm-source=bestbotfor',
  sendr: 'https://sendr.cello.so/LOp5fYtd9Jc',
  'julius-ai': 'https://julius.dub.link/mark-putiyon',
} as const

describe('approved affiliate programs', () => {
  it('activates only the approved slugs and stores their exact tracking links', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr', 'julius-ai'])
    for (const tool of toolSeeds) {
      const approved = (APPROVED_ACTIVE_AFFILIATES as readonly string[]).includes(tool.slug)
      if (!approved) {
        expect(tool.affiliate.status, tool.slug).not.toBe(ACTIVE_AFFILIATE_STATUS)
        expect(tool.affiliate.affiliateUrl ?? null, tool.slug).toBeNull()
      }
      expect(affiliateSeedValues(tool).affiliateUrl, tool.slug).toBe(approved ? tool.affiliate.affiliateUrl : null)
    }
    for (const slug of PREPARED_AFFILIATE_SLUGS) {
      const tool = toolSeeds.find((item) => item.slug === slug)
      expect(tool, slug).toBeTruthy()
      expect(tool?.affiliate.hasProgram).toBe(true)
      if (slug in LIVE_AFFILIATE_URLS) {
        expect(tool?.affiliate.status).toBe('active')
        expect(tool?.affiliate.affiliateUrl).toBe(LIVE_AFFILIATE_URLS[slug as keyof typeof LIVE_AFFILIATE_URLS])
      } else {
        expect(tool?.affiliate.status).toBe('inactive')
        expect(tool?.affiliate.affiliateUrl ?? null).toBeNull()
      }
    }
    expect(toolSeeds.find((tool) => tool.slug === 'lovable')?.allowedHosts).toEqual(['lovable.dev'])
    expect(toolSeeds.find((tool) => tool.slug === 'writesonic')?.allowedHosts).toEqual(['writesonic.com'])
    const catalog = read('src/data/catalog.ts')
    for (const url of Object.values(LIVE_AFFILIATE_URLS)) expect(catalog).toContain(url)
    expect(catalog).not.toContain('*.sjv.io')
    expect(catalog).not.toContain('*.partnerstack.com')
    expect(catalog).not.toContain("'dub.sh'")
    expect(catalog).not.toContain("'partnerstack.com'")
  })

  it('refuses to seed an active program or a URL until that slug is approved', () => {
    expect(() =>
      affiliateSeedValues({
        slug: 'writesonic',
        affiliate: { hasProgram: true, network: null, sourceUrl: null, status: 'active', commissionNote: null, affiliateUrl: 'https://partnerstack.com/x' },
      }),
    ).toThrow(/owner approval/)
    expect(() =>
      affiliateSeedValues({
        slug: 'lovable',
        affiliate: { hasProgram: true, network: 'Impact', sourceUrl: null, status: 'inactive', commissionNote: null, affiliateUrl: 'https://track.sjv.io/c/1' },
      }),
    ).toThrow(/affiliate URL/)
  })

  it('lists prepared programs for the read-only admin page without the tracking URL', () => {
    const rows = affiliateAdminRows(toolSeeds)
    for (const slug of PREPARED_AFFILIATE_SLUGS) {
      const row = rows.find((item) => item.slug === slug)
      const live = slug in LIVE_AFFILIATE_URLS
      expect(row?.status).toBe(live ? 'active' : 'inactive')
      expect(row?.hasUrl).toBe(live)
      expect(row?.prepared).toBe(true)
      expect(row).not.toHaveProperty('affiliateUrl')
    }
    expect(read('src/app/admin/affiliates/page.tsx')).toContain('Read-only')
    expect(read('src/app/admin/affiliates/page.tsx')).not.toContain('action=')
  })
})

describe('score and ranking ignore affiliate fields', () => {
  it('does not read affiliate or commission fields in the score or rank functions', () => {
    const banned = /\b(affiliateUrl|affiliate_url|commissionNote|commission_note|hasProgram|hasAffiliateLink|affiliatePrograms|programId|program_id)\b/
    for (const file of ['src/lib/scoring.ts', 'src/lib/editorial.ts', 'src/lib/recommend.ts']) {
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
      hasAffiliateLink: true,
      status: 'active',
      programId: 9,
    }
    const ranked = rankTools([withMoney, { ...base, hasAffiliateLink: false }], { budget: 'any', skill: 'beginner' })
    expect(ranked.map((item) => item.score)).toEqual([ranked[0]?.score, ranked[0]?.score])
    expect(ranked.map((item) => item.slug)).toEqual(['alpha', 'beta'])
    const catalog = rankingCatalog()
    const recommended = recommend(catalog, { task: 'writing', budget: 'any', skill: 'beginner' })
    expect(recommended?.picks.map((pick) => pick.slug)).toEqual(['alpha', 'beta'])
    expect(recommended?.ranked.map((item) => item.slug)).toEqual(['alpha', 'beta'])
    const listed = toolsForTask(catalog, 'writing')
    expect(listed.map((tool) => tool.slug)).toEqual(['alpha', 'beta'])
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
    expect(html).toContain('ElevenLabs (PartnerStack) — active')
    expect(html).toContain('Synthesia (Rewardful) — active')
    expect(html).toContain('Descript (PartnerStack) — active')
    expect(html).toContain('Murf — active')
    expect(html).toContain('Papermark Data Rooms 2.0 (Papermark) — active')
    expect(html).toContain('DocsAlot — active')
    expect(html).toContain('Sendr (Cello) — active')
    expect(html).toContain('Julius AI — active')
    expect(html).toContain('Writesonic — switched off')
    expect(html).toContain('Lovable (Impact) — switched off')
    expect(html).toContain('switched off')
    for (const name of ['ElevenLabs', 'Synthesia', 'Descript', 'Murf', 'Papermark', 'DocsAlot', 'Sendr', 'Julius AI', 'Writesonic', 'Lovable']) {
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

function rankingCatalog(): Catalog {
  const tool = (slug: string, name: string, active: boolean): CatalogTool => ({
    id: slug === 'alpha' ? 1 : 2,
    slug,
    name,
    vendor: name,
    url: 'https://example.com',
    category: 'Writing',
    shortDesc: 'A short description.',
    longDesc: 'A long description.',
    pricingModel: 'freemium',
    priceFromUsd: 20,
    hasFreeTier: true,
    skillLevel: 'beginner',
    platforms: ['Web'],
    lastVerifiedAt: '2026-11-03',
    fits: [{ taskSlug: 'writing', taskName: 'Write', score: 80, notes: 'A fit note.' }],
    affiliate: {
      hasProgram: active,
      network: active ? 'PartnerStack' : null,
      sourceUrl: null,
      status: active ? 'active' : 'inactive',
      commissionNote: active ? '50% forever' : null,
      affiliateUrl: active ? 'https://partnerstack.com/x' : null,
    },
    editorial: null,
    pros: [],
    cons: [],
    quizEligible: true,
  })
  return {
    tasks: [{ slug: 'writing', name: 'Write', category: 'Writing', description: 'Draft copy.' }],
    tools: [tool('beta', 'Beta', true), tool('alpha', 'Alpha', false)],
  }
}

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
