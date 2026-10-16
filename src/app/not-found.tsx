import type { Metadata } from 'next'
import Link from 'next/link'
import { notFoundDescription, notFoundTitle } from '@/lib/metadata'

export const metadata: Metadata = {
  // Absolute so the layout template does not turn this into "Page not found · BestBotFor".
  title: { absolute: notFoundTitle },
  description: notFoundDescription,
  // Drop the layout canonical. A missing URL should not claim the home page.
  alternates: {},
  robots: { index: false, follow: false },
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
