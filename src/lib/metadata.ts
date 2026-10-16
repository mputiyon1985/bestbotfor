import type { Metadata } from 'next'
import { OG_IMAGE_PATH } from './brand'
import { isProductionDeployment } from './indexing'
import { omitScoreText } from './score-visibility'
import { absoluteUrl, getSiteUrl, SITE_NAME, TAGLINE } from './site'

export function pageMetadata(input: {
  title: string
  description: string
  path: string
  absoluteTitle?: boolean
  imagePath?: string
  noIndex?: boolean
  /** Used with noIndex. Off by default so error and search pages stay nofollow. */
  follow?: boolean
  pagination?: { previous?: string | null; next?: string | null }
}): Metadata {
  const title = omitScoreText(input.title)
  const description = omitScoreText(input.description)
  const canonical = new URL(input.path, getSiteUrl()).toString()
  const image = input.imagePath ?? OG_IMAGE_PATH
  const previous = input.pagination?.previous ? absoluteUrl(input.pagination.previous) : undefined
  const next = input.pagination?.next ? absoluteUrl(input.pagination.next) : undefined
  const branded = socialTitle(title)
  return {
    title: input.absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical },
    pagination: previous || next ? { previous, next } : undefined,
    robots: pageRobots(input),
    openGraph: {
      title: branded,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: 'en_US',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: branded,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
  }
}

/** Open Graph and Twitter titles do not pick up the document title template. */
function socialTitle(title: string): string {
  const suffix = `| ${SITE_NAME}`
  return title.endsWith(suffix) ? title : `${title} ${suffix}`
}

function pageRobots(input: { noIndex?: boolean; follow?: boolean }): { index: boolean; follow: boolean } {
  if (!isProductionDeployment()) return { index: false, follow: false }
  if (input.noIndex) return { index: false, follow: input.follow === true }
  return { index: true, follow: true }
}

export const homeTitle = `${SITE_NAME} — ${TAGLINE}`

export const notFoundTitle = `Page not found | ${SITE_NAME}`

export const notFoundDescription = 'That page is not in the catalog.'

export const homeDescription = `${TAGLINE} Answer three questions (your task, budget and experience) and get the best AI tool for the job plus up to six alternatives.`
