import { notFound } from 'next/navigation'


// Same metadata as not-found.tsx, including robots: null. Without this, the
// client hydrates the layout robots tag (index, follow in production) next to
// Next's noindex insertion.
export { metadata } from '../not-found'

/**
 * Match every URL that no page claims, then call notFound().
 *
 * Next inserts the noindex meta for that call. It also inserts one when the
 * built-in `/_not-found` route is rewritten to `/404` before render, which is
 * what `next start` does. Vercel serves `/_not-found` with the HTTP status set
 * outside that render, so the insertion never runs and the document has no
 * robots meta. This route makes the unmatched URL take the notFound() path on
 * both hosts. The not-found page leaves robots empty so the insertion is the
 * only tag.
 */
export default function UnmatchedPage(): never {
  notFound()
}
