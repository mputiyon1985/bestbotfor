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
  /** True when the tool has an affiliate_url. The link is rel="sponsored" either way. */
  affiliate?: boolean
}) {
  return (
    <a
      href={`/go/${slug}`}
      rel="sponsored nofollow noopener"
      className={className}
      data-affiliate={affiliate ? 'true' : undefined}
      onClick={() => track('affiliate_click', { tool: slug })}
    >
      {children}
    </a>
  )
}
