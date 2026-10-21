import Link from 'next/link'
import { SocialIconRow } from './social-icons'
import { isClerkConfigured } from '@/lib/flags'
import { BrandLockup } from './brand-lockup'
import { MemberButtonSlot } from './member-button-slot'

export async function SiteHeader() {
  let signedIn = false
  if (isClerkConfigured()) {
    const { auth } = await import('@clerk/nextjs/server')
    const session = await auth()
    signedIn = Boolean(session.userId)
  }

  const links = [
    { href: '/tools', label: 'Tools' },
    { href: '/best', label: 'Best for' },
    { href: '/compare', label: 'Compare' },
    { href: '/newsletter', label: 'Newsletter' },
    { href: '/sponsor', label: 'Advertise' },
  ]

  return (
    <header className="relative z-20 border-b border-line bg-paper">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 pt-4 pb-6 md:py-4">
        <BrandLockup />
        <nav aria-label="Primary" className="hidden min-w-0 max-w-full flex-wrap items-center justify-end gap-x-4 gap-y-1 md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-ink underline-offset-4 hover:underline">
              {link.label}
            </Link>
          ))}
          {signedIn ? (
            <Link href="/members" className="inline-flex min-h-11 items-center text-sm font-semibold underline-offset-4 hover:underline">
              Members
            </Link>
          ) : (
            <Link href="/sign-in" className="inline-flex min-h-11 items-center text-sm font-semibold underline-offset-4 hover:underline">
              Sign in
            </Link>
          )}
          {signedIn ? <MemberButtonSlot /> : null}
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
            {signedIn ? (
              <div className="min-h-12 py-2">
                <MemberButtonSlot />
              </div>
            ) : null}
            <div aria-label="Follow BestBotFor" role="group" className="border-t border-line pt-2">
              <SocialIconRow />
            </div>
          </nav>
        </details>
      </div>
    </header>
  )
}
