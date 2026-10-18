import Link from 'next/link'
import { PICK_CAP_LEAD, PICK_CAP_LINK } from '@/lib/pick-save'

export function PickCapNotice() {
  return (
    <p>
      {PICK_CAP_LEAD}{' '}
      <Link href="/pricing" className="inline-flex min-h-11 items-center font-semibold underline">
        {PICK_CAP_LINK}
      </Link>
    </p>
  )
}
