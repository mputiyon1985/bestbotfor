'use client'

import { useState } from 'react'
import { useReverification } from '@clerk/nextjs'
import { adminStepUpProbe } from '@/app/admin/actions'

export function AdminStepUpButton() {
  const [confirmed, setConfirmed] = useState(false)
  const run = useReverification(async () => {
    const result = await adminStepUpProbe()
    return result
  })

  return (
    <form
      action={async () => {
        const result = await run()
        setConfirmed(Boolean(result && 'ok' in result && result.ok))
      }}
    >
      <button type="submit" className="inline-flex min-h-11 items-center underline">
        Confirm a sensitive action
      </button>
      {confirmed ? <p role="status">Confirmed.</p> : null}
    </form>
  )
}
