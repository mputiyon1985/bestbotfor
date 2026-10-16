# Changelog

## Unreleased

- The quiz result shows one pick and up to six alternatives that clear a fit score of 50. When fewer qualify, the page still says few strong options exist.
- All-matches pages list six tools and show “Showing 1–6 of N” with numbered page links. Budget filters stay noindex, rel prev/next and the canonical rules are unchanged, and a page past the end is still a 404.
- Tool pages can show a BestBotFor score from 0 to 5, with a fractional star, the features/value/ease/quality rubric, and a short note on how the equal-weight average is calculated. The score is editorial. Pages do not emit AggregateRating or Review schema.
- Pros and cons render on the tool page, and a shorter version renders on result cards, only when a tool has verified rows with source URLs.
- `src/data/scores-pros-cons.csv` is the editorial seed for 146 tools. The 13 tools without a row hide the score and the pros and cons. `source_urls` and third-party columns are not stored and are not rendered. Tool pages show a bar for features, value, ease, and quality next to the overall stars.
- Relevance AI’s free plan is retired, so the seed upserts `hasFreeTier` as false. Windsurf keeps its name, is flagged `needs_verification`, and has no score.
- Quiz results, all-matches lists, and tool pages keep the stars, score bars, pros and cons, and numbered pagination inside the screen at 375, 390, and 768 pixels. Pagination links are at least 44 pixels tall, and text stays at least 12 pixels.
- Text links in the breadcrumbs, best-of lists, footer, and tablet header keep a 44 pixel tap height. Page controls are full-size buttons. The header sits clear of the breadcrumb and “Back to the questions” on a phone, and “See my best bot” stays on screen at 390 pixels.
- Encoded and raw dot segments return 404 from a Vercel route and from the app server. The global `URL` constructor and `http.Server` are no longer patched.
- Quiz result URLs and budget-filtered match lists are `noindex, follow`. `/result?task=X&view=all` page 1 stays indexable and in the sitemap. Lighthouse scores SEO on that indexable list. The production-env check asserts the quiz and budget-filtered pages render `noindex, follow`.
- The first paint uses a metric-matched fallback for every Poppins weight, so the delayed swap does not reflow the tools directory.
- “See all N matches” keeps the quiz budget. Match and quiz titles use the task’s own name.
- `/tools` page numbers that are not a real page return 404, including category filters, so each indexable canonical belongs to one page.
- Encoded dot segments under `/go`, `/best`, and `/tools` return 404 instead of the home page. `/go` responses send `X-Robots-Tag: noindex, nofollow`.
- The catalog seed runs in one transaction and still only upserts. It does not delete rows.
- Expand the catalog with 108 reviewed tools. Affiliate status on the new tools stays unknown, and outbound links stay on official sites.
- `/tools` stays paginated and filters by category with a shareable `?category=` URL. Every catalog tool lists the hosts `/go` may redirect to.
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
