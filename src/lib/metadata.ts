import type { Metadata } from 'next'
import { OG_IMAGE_PATH } from './brand'
import { isProductionDeployment } from './indexing'
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
  const canonical = new URL(input.path, getSiteUrl()).toString()
  const image = input.imagePath ?? OG_IMAGE_PATH
  const previous = input.pagination?.previous ? absoluteUrl(input.pagination.previous) : undefined
  const next = input.pagination?.next ? absoluteUrl(input.pagination.next) : undefined
  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: { canonical },
    pagination: previous || next ? { previous, next } : undefined,
    robots: pageRobots(input),
    openGraph: {
      title: input.title,
      description: input.description,
      url: canonical,
      siteName: SITE_NAME,
      locale: 'en_US',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: input.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      images: [image],
    },
  }
}

function pageRobots(input: { noIndex?: boolean; follow?: boolean }): { index: boolean; follow: boolean } {
  if (!isProductionDeployment()) return { index: false, follow: false }
  if (input.noIndex) return { index: false, follow: input.follow === true }
  return { index: true, follow: true }
}

export const homeTitle = `${SITE_NAME} — ${TAGLINE}`

export const homeDescription = `${TAGLINE} BestBotFor names one AI tool for the job and up to five alternatives, based on your budget and experience.`
