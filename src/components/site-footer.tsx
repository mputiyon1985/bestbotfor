import Link from 'next/link'
import { taskSeeds } from '@/data/catalog'
import { BUSINESS_PHONE_DISPLAY, BUSINESS_PHONE_HREF, TAGLINE } from '@/lib/site'
import { SOCIAL_LINK_REL, SOCIAL_LINKS } from '@/lib/social'
import { SocialIcon } from './social-icons'
import { BrandLockup } from './brand-lockup'
import { CookieSettingsButton } from './cookie-settings-button'
import { SuggestSomethingLink } from './suggest-something'

export function SiteFooter() {
  return (
    <footer className="mt-16 scroll-mb-24 border-t border-line">
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-3 md:gap-x-10 md:gap-y-6">
        <div>
          <BrandLockup />
          <p className="mt-2 text-sm leading-snug text-muted">{TAGLINE}</p>
          <p className="mt-1 text-sm">
            <span className="font-semibold">Call us: </span>
            <a className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href={BUSINESS_PHONE_HREF}>
              {BUSINESS_PHONE_DISPLAY}
            </a>
          </p>
          <nav aria-label="Follow BestBotFor" className="mt-2">
            <h2 className="text-sm font-semibold">Follow</h2>
            <ul className="mt-1 flex gap-1 text-sm" data-social-icons>
              {SOCIAL_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    className="inline-flex size-11 scroll-mb-24 items-center justify-center rounded-full text-muted hover:text-ink"
                    href={link.href}
                    rel={SOCIAL_LINK_REL}
                    aria-label={link.label}
                    title={link.label}
                  >
                    <SocialIcon name={link.name} />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <nav aria-label="Best for">
          <h2 className="text-sm font-semibold">Best for</h2>
          <ul className="mt-1 grid grid-cols-2 gap-x-4 text-sm md:grid-cols-1">
            {taskSeeds.map((task) => (
              <li key={task.slug}>
                <Link className="inline-flex min-h-11 scroll-mb-24 items-center leading-tight underline-offset-4 md:min-h-8 hover:underline" href={`/best/${task.slug}`}>
                  {task.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Company">
          <h2 className="text-sm font-semibold">Company</h2>
          <ul className="mt-1 grid grid-cols-2 gap-x-4 text-sm md:grid-cols-1">
            <li><Link className="inline-flex min-h-11 scroll-mb-24 items-center leading-tight underline-offset-4 md:min-h-8 hover:underline" href="/about">About</Link></li>
            <li><Link className="inline-flex min-h-11 scroll-mb-24 items-center leading-tight underline-offset-4 md:min-h-8 hover:underline" href="/how-we-rate">How we rate</Link></li>
            <li><Link className="inline-flex min-h-11 scroll-mb-24 items-center leading-tight underline-offset-4 md:min-h-8 hover:underline" href="/guides/how-to-choose-an-ai-tool">How to choose an AI tool</Link></li>
            <li><Link className="inline-flex min-h-11 scroll-mb-24 items-center leading-tight underline-offset-4 md:min-h-8 hover:underline" href="/ai-loadout">The AI Loadout</Link></li>
            <li><Link className="inline-flex min-h-11 scroll-mb-24 items-center leading-tight underline-offset-4 md:min-h-8 hover:underline" href="/disclosure">Disclosures</Link></li>
            <li><Link className="inline-flex min-h-11 scroll-mb-24 items-center leading-tight underline-offset-4 md:min-h-8 hover:underline" href="/privacy">Privacy</Link></li>
            <li><CookieSettingsButton /></li>
            <li><Link className="inline-flex min-h-11 scroll-mb-24 items-center leading-tight underline-offset-4 md:min-h-8 hover:underline" href="/tools">Tools</Link></li>
            <li><Link className="inline-flex min-h-11 scroll-mb-24 items-center leading-tight underline-offset-4 md:min-h-8 hover:underline" href="/terms">Terms</Link></li>
            <li><Link className="inline-flex min-h-11 scroll-mb-24 items-center leading-tight underline-offset-4 md:min-h-8 hover:underline" href="/newsletter">Newsletter</Link></li>
            <li><Link className="inline-flex min-h-11 scroll-mb-24 items-center leading-tight underline-offset-4 md:min-h-8 hover:underline" href="/pricing">Pricing</Link></li>
            <li><Link className="inline-flex min-h-11 scroll-mb-24 items-center leading-tight underline-offset-4 md:min-h-8 hover:underline" href="/sponsor">Sponsor</Link></li>
            <li>
              <SuggestSomethingLink className="inline-flex min-h-11 scroll-mb-24 items-center gap-2 leading-tight underline-offset-4 md:min-h-8 hover:underline" />
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}
