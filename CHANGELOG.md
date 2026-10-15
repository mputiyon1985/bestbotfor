# Changelog

## Unreleased

- Apply the approved concept 1 brand: Poppins, the indigo and mint palette, lockups in the header and footer, kit favicons, and kit Open Graph art.
- Home page inlines the lockup, inlines CSS, and renders the picker on the server so LCP stays under 2.1s and total blocking time stays under 230ms. Poppins loads after that first paint.
- `/api/og` sends a one-day CDN cache, redirects invalid query strings to `/api/og`, and rate-limits generation in the route. A missing catalog serves an uncached fallback image.
- SVG responses send a locked content security policy. Hashed brand files cache for a year. Poppins ships as woff2 only.
- Deployments that are not Vercel production send `X-Robots-Tag: noindex` and a noindex robots file, so preview hosts stay out of search.
- Cookie settings in the footer reopens the consent choice. Pricing states that checkout is Stripe test mode.
- The picker result, checkout, and billing portal are rate-limited.
- Quiz scoring and the tools directory use indexed queries. `/tools` is paginated. Fit rows are grouped once instead of scanned per tool.
- Google Analytics does not load gtag.js until the visitor accepts cookies.
- `/go` redirects only to the reviewed host for that tool.
- `/go` fails open when the rate-limit write is slow, and records the click after the redirect.
- CI runs gitleaks, a client-bundle token scan, database-write and member-route checks, Lighthouse, and CodeQL. Actions are pinned to commit SHAs.

## 0.1.0

- Local `file:` databases create their parent directory before migrate and seed.
- Search text is removed from Google Analytics page views.
- The consent banner stays in the page flow so it does not cover focused links.
- `/go`, `/best`, and `/tools` reject encoded dot segments and slugs outside the catalog shape.
- Three-question picker with a shareable result, one pick, and alternatives.
- Catalog pages for jobs, comparisons, and tools.
- Allowlist `/go` redirects to each tool’s official URL.
- Newsletter signup with a honeypot and optional Beehiiv delivery.
- Clerk-gated members area and Stripe test-mode checkout, billing portal, and webhooks.
- Sitemap, robots, llms.txt, JSON-LD, and Open Graph images on https://bestbotfor.com.
- Consent Mode v2 for Google Analytics 4, plus cookieless Vercel Analytics.
