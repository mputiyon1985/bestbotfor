import type { Metadata } from 'next'
import { getSiteUrl, SITE_NAME, TAGLINE } from './site'

export function pageMetadata(input: {
  title: string
  description: string
  path: string
  absoluteTitle?: boolean
  imagePath?: string
  noIndex?: boolean
}): Metadata {
  const canonical = new URL(input.path, getSiteUrl()).toString()
  const image = input.imagePath ?? '/opengraph-image'
  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: { canonical },
    robots: input.noIndex ? { index: false, follow: false } : { index: true, follow: true },
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

export const homeTitle = `${SITE_NAME} — ${TAGLINE}`

export const homeDescription = `${TAGLINE} BestBotFor names one AI tool for the job and two alternatives, based on your budget and experience.`
