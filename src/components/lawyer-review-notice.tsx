import { LAWYER_REVIEW_NOTICE } from '@/lib/ratings-policy-copy'

export function LawyerReviewNotice() {
  return (
    <p role="note" className="border border-line px-3 py-3 font-semibold">
      {LAWYER_REVIEW_NOTICE}
    </p>
  )
}
