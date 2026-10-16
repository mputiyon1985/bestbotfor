import { ORGANIZATION_LOGO_PATH } from './brand'
import { absoluteUrl, getSiteUrl, SITE_NAME, TAGLINE } from './site'
import type { CatalogTool } from './catalog-types'

export function websiteJsonLd() {
  const site = getSiteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: site,
    description: TAGLINE,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${site}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: getSiteUrl(),
    slogan: TAGLINE,
    description: `${TAGLINE} BestBotFor recommends one AI tool and up to five alternatives.`,
    logo: absoluteUrl(ORGANIZATION_LOGO_PATH),
  }
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

export function faqJsonLd(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  }
}

export function softwareJsonLd(tool: CatalogTool) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: tool.name,
    applicationCategory: tool.category,
    operatingSystem: tool.platforms.join(', '),
    description: tool.shortDesc,
    url: absoluteUrl(`/tools/${tool.slug}`),
    publisher: { '@type': 'Organization', name: tool.vendor },
    ...(tool.hasFreeTier
      ? { offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free tier' } }
      : {}),
  }
}

export function itemListJsonLd(name: string, path: string, tools: { name: string; slug: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url: absoluteUrl(path),
    itemListElement: tools.map((tool, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: tool.name,
      url: absoluteUrl(`/tools/${tool.slug}`),
    })),
  }
}
