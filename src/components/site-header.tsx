import Link from 'next/link'
import { isClerkConfigured } from '@/lib/flags'
import { MemberButton } from './member-button'

export async function SiteHeader() {
  let signedIn = false
  if (isClerkConfigured()) {
    const { auth } = await import('@clerk/nextjs/server')
    const session = await auth()
    signedIn = Boolean(session.userId)
  }

  const links = [
    { href: '/best/coding', label: 'Best for' },
    { href: '/compare/cursor-vs-github-copilot', label: 'Compare' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/newsletter', label: 'Newsletter' },
  ]

  return (
    <header className="border-b border-line bg-paper/95">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="font-serif text-2xl font-medium tracking-tight">
          Best<span className="text-forest">Bot</span>For
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-5 md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm font-semibold text-ink underline-offset-4 hover:underline">
              {link.label}
            </Link>
          ))}
          {signedIn ? (
            <Link href="/members" className="text-sm font-semibold underline-offset-4 hover:underline">
              Members
            </Link>
          ) : (
            <Link href="/sign-in" className="text-sm font-semibold underline-offset-4 hover:underline">
              Sign in
            </Link>
          )}
          {signedIn ? <MemberButton /> : null}
        </nav>
        <details className="md:hidden">
          <summary className="min-h-12 cursor-pointer list-none rounded-full border border-line px-4 py-2 text-sm font-semibold">
            Menu
          </summary>
          <nav aria-label="Mobile" className="absolute right-4 z-30 mt-2 flex w-56 flex-col gap-2 rounded-2xl border border-line bg-card p-4 shadow-lg">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="min-h-12 py-2 font-semibold">
                {link.label}
              </Link>
            ))}
            <Link href={signedIn ? '/members' : '/sign-in'} className="min-h-12 py-2 font-semibold">
              {signedIn ? 'Members' : 'Sign in'}
            </Link>
          </nav>
        </details>
      </div>
    </header>
  )
}
