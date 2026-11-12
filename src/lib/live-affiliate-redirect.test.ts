import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { resolveGoRedirect, resolveHeadGoRedirect } from './go-redirect'

/**
 * Destinations /go produced on main for the two live programs, before this
 * branch's SubID. ElevenLabs is PartnerStack, so the branch adds sid; the
 * tracking URL underneath stays the one on main. Synthesia has no SubID param.
 */
const MAIN_GO = {
  elevenlabs: 'https://try.elevenlabs.io/8hbaa9knuwda?utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct',
  synthesia: 'https://www.synthesia.io/?via=mark-putiyon&utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct',
} as const

async function go(slug: string) {
  const tool = toolSeeds.find((item) => item.slug === slug)
  if (!tool) throw new Error(slug)
  return resolveGoRedirect({
    headers: new Headers(),
    ip: null,
    siteUrl: 'https://bestbotfor.com',
    seedUrl: tool.url,
    seedAffiliateUrl: tool.affiliate.affiliateUrl ?? null,
    seedAffiliateStatus: tool.affiliate.status,
    seedNetwork: tool.affiliate.network,
    allowedHosts: [...tool.allowedHosts],
    limit: async () => ({ ok: true }),
    loadTool: async () => ({
      id: 1,
      url: tool.url,
      affiliateUrl: tool.affiliate.affiliateUrl ?? null,
      affiliateStatus: tool.affiliate.status,
      network: tool.affiliate.network,
    }),
  })
}

describe('live affiliate redirects match main', () => {
  it('keeps the ElevenLabs and Synthesia URLs main uses today', async () => {
    expect(toolSeeds.find((tool) => tool.slug === 'elevenlabs')?.affiliate.affiliateUrl).toBe(
      'https://try.elevenlabs.io/8hbaa9knuwda',
    )
    expect(toolSeeds.find((tool) => tool.slug === 'synthesia')?.affiliate.affiliateUrl).toBe(
      'https://www.synthesia.io?via=mark-putiyon',
    )

    const eleven = await go('elevenlabs')
    expect(eleven).toMatchObject({
      status: 302,
      location: MAIN_GO.elevenlabs,
      click: { affiliate: true, programId: 1, subIdParam: 'sid' },
    })

    const synthesia = await go('synthesia')
    expect(synthesia).toMatchObject({
      status: 302,
      location: MAIN_GO.synthesia,
      click: { affiliate: true, programId: 1, subIdParam: null },
    })
  })

  it('sends Descript, Murf, Papermark, and DocsAlot to their exact tracking links', async () => {
    const activated = {
      descript: {
        stored: 'https://get.descript.com/mr4pi3y6tp4s',
        location: 'https://get.descript.com/mr4pi3y6tp4s?utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct',
        subIdParam: 'sid',
        official: 'https://www.descript.com/',
      },
      murf: {
        stored: 'https://get.murf.ai/pxci5cc1lpk2',
        location: 'https://get.murf.ai/pxci5cc1lpk2?utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct',
        subIdParam: null,
        official: 'https://murf.ai/',
      },
      papermark: {
        stored: 'https://refer.papermark.com/mark',
        location: 'https://refer.papermark.com/mark?utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct',
        subIdParam: null,
        official: 'https://www.papermark.com/',
      },
      docsalot: {
        stored: 'https://docsalot.dev/?utm-source=bestbotfor',
        location: 'https://docsalot.dev/?utm-source=bestbotfor',
        subIdParam: null,
        official: 'https://docsalot.dev/',
      },
    } as const

    for (const [slug, expected] of Object.entries(activated)) {
      expect(toolSeeds.find((tool) => tool.slug === slug)?.affiliate.affiliateUrl).toBe(expected.stored)
      const outcome = await go(slug)
      expect(outcome, slug).toMatchObject({
        status: 302,
        location: expected.location,
        click: { affiliate: true, programId: 1, subIdParam: expected.subIdParam },
      })
      expect(resolveHeadGoRedirect(slug), slug).toMatchObject({ status: 302, location: expected.official })
    }
  })
})
