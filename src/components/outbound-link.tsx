'use client'

import type { ReactNode } from 'react'
import { track } from '@/lib/analytics'

export function OutboundLink({
  slug,
  children,
  className,
  affiliate = false,
}: {
  slug: string
  children: ReactNode
  className?: string
  /** True when /go serves the affiliate URL. Only then is the link rel="sponsored". */
  affiliate?: boolean
}) {
  return (
    <a
      href={`/go/${slug}`}
      rel={affiliate ? 'sponsored nofollow noopener' : 'nofollow noopener'}
      className={className}
      data-affiliate={affiliate ? 'true' : undefined}
      onClick={() => track('affiliate_click', { tool: slug })}
    >
      {children}
    </a>
  )
}
