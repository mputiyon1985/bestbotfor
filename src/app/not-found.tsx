import type { Metadata } from 'next'
import Link from 'next/link'
import { notFoundTitle } from '@/lib/metadata'

export const metadata: Metadata = {
  // Absolute so the layout template does not turn this into "Page not found · BestBotFor".
  title: { absolute: notFoundTitle },
  robots: { index: false, follow: false },
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
