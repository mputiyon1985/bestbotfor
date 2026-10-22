'use client'

import { useEffect, useState } from 'react'
import { captureFirstTouch, readFirstTouch } from '@/lib/first-touch'

/** Hidden form field with the stored first-touch record. The server re-sanitizes it. */
export function FirstTouchField() {
  const [value, setValue] = useState('')
  useEffect(() => {
    const record = readFirstTouch() ?? captureFirstTouch(window.location)
    setValue(record ? JSON.stringify(record) : '')
  }, [])
  return <input type="hidden" name="first_touch" value={value} />
}
