import type { Metadata } from 'next'
import Link from 'next/link'
import { notFoundDescription, notFoundTitle } from '@/lib/metadata'

export const metadata: Metadata = {
  // Absolute so the layout template does not turn this into "Page not found · BestBotFor".
  title: { absolute: notFoundTitle },
  description: notFoundDescription,
  // Drop the layout canonical. A missing URL should not claim the home page.
  alternates: {},
  // Next inserts one `<meta name="robots" content="noindex">` when notFound()
  // throws, and also when it renders this page as /404. Null clears the layout
  // robots so that insertion stays the only tag. A robots value here is a
  // second tag on next start and on missing tools. Vercel does not insert the
  // tag for the built-in /_not-found route; unmatched URLs call notFound()
  // from the root catch-all instead of rendering that route.
  robots: null,
  openGraph: {
    title: { absolute: notFoundTitle },
    description: notFoundDescription,
  },
  twitter: {
    card: 'summary',
    title: { absolute: notFoundTitle },
    description: notFoundDescription,
  },
}

export default function NotFound() {
  return (
    <div className="space-y-4">
      <h1 className="font-bold text-5xl">Page not found</h1>
      <p>That page is not in the catalog.</p>
      <Link href="/" className="inline-flex min-h-12 items-center font-semibold underline">
        Back home
      </Link>
    </div>
  )
}
