'use client'

import { Analytics } from '@vercel/analytics/next'
import { useEffect, useState } from 'react'
import { allowVercelAnalyticsEvent, readNavigatorGpc } from '@/lib/gpc'

export function SiteAnalytics({ secGpc }: { secGpc: boolean }) {
  const [navigatorGpc, setNavigatorGpc] = useState(false)
  useEffect(() => {
    setNavigatorGpc(readNavigatorGpc())
  }, [])
  if (secGpc || navigatorGpc) return null
  return <Analytics beforeSend={(event) => allowVercelAnalyticsEvent(event, secGpc)} />
}
