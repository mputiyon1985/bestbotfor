'use client'

import { useEffect } from 'react'
import { captureFirstTouch } from '@/lib/first-touch'

/** Mounted once in the root layout. Runs on the landing page before any client navigation drops the query. */
export function FirstTouchCapture() {
  useEffect(() => {
    captureFirstTouch(window.location)
  }, [])
  return null
}
