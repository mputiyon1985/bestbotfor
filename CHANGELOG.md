# Changelog

## Unreleased

- Each sponsor option on `/sponsor` says “One-time payment, no auto-renewal.” Checkout repeats that line under the pay button. Week, month, and newsletter stay one-time payments. The test-mode setup script keeps a matching one-time Price and updates its Product name and statement descriptor to BestBotFor. New Prices use an idempotency key that includes `one_time`.

- Sponsor Checkout sends Stripe back to the request’s own origin when that host is bestbotfor.com, www.bestbotfor.com, or this project’s Vercel deployment. Production always returns to https://bestbotfor.com, including when that environment name has surrounding spaces. On a preview, the deployment URL is used ahead of an apex or www Origin. Loopback http is accepted only when the request host is itself loopback and the environment is not production. The return URLs are part of the Checkout idempotency key. Other hosts are ignored. Fulfillment stores a sponsorship only when the Checkout line quantity is 1. The client bundle scan flags a live publishable key and skips Clerk’s invalid-key message.
- Sponsor Checkout on `/sponsor` sells a featured `/best/[task]` slot ($99 per week or $299 per month) and a newsletter slot ($49 per issue). Those Prices are one-time charges of 9900, 29900, and 4900 cents, with no Stripe recurring interval. The Stripe product name and the card statement suffix are BestBotFor. Prices are server config. Checkout disables Managed Payments for these advertising placements and leaves automatic tax unset. Live Stripe keys stay refused unless the live flag is set to true, and that flag ships off. The sponsorship tables land in `drizzle/0009_sponsorships.sql`, after main’s `0008_ratings_v23.sql`. That migration adopts the table left by the old `0005_sponsorships.sql`: `CREATE TABLE` and `CREATE INDEX` use `IF NOT EXISTS`, missing columns are added, and nothing is deleted. The stray `schema_migrations` row `0005_sponsorships.sql` stays, because the migrator only runs files in `drizzle/` and does not look up a ledger id that has no file.
- `/how-we-rate` no longer says every score links to its sources. It says we keep the evidence and sources for each score on file and review them quarterly.
- `SHOW_SCORES` is true, so the v2.3 ratings render through that flag. Rated tool pages lead with the category rank from `category_rank_display`, for example `#3 of 12 in Coding`. A shared tie group prefixes that line with `Tied · ` and keeps each tool’s own rank. The rank is hidden for the single-tool categories backend, design, games, and productivity. Four bars follow (Quality, Features, Value, Ease), the overall score is secondary and links to `/how-we-rate`, and a filled note is shown. Quiz and all-matches cards show the same rank line and overall score without the bars. Turning the flag off hides the heading, rank, stars, bars, note, and maintenance notice together. Pros and cons stay. Pages still do not emit AggregateRating.
- Ratings v2.3 replace the v1 scores in one seed transaction. From the scores already in production, that is 4 score rows inserted (`cursor`, `grok`, `semantic-scholar`, `windsurf`), 87 score rows updated, and 59 score rows removed. Pros and cons point rows: 0 inserted, 735 updated, 0 removed. The seed does not delete any pros or cons row, so tools unrated in v2.3 keep theirs and those still render. A second run updates the 91 score rows and 735 point rows and removes nothing. Unrated tools are left with no score row and hide the score and rank. Cursor and Windsurf are rated, so a stale score for either is replaced by the v2.3 row. Evidence and source URL columns are not stored on the score row and are not rendered.
- Cursor’s current plans are Free $0, Plus $8 (Grok models only), and Premium $30 (third-party models billed extra). Pro $20 is for legacy subscribers only.
- Relevance AI stays without a free plan. Pro is $19 a month billed yearly.
- Windsurf stays at `/tools/windsurf` and at `/compare/cursor-vs-windsurf`. The name is Devin Desktop (formerly Windsurf), the vendor is Cognition, the site is https://devin.ai/desktop, and pricing is Free $0 and Pro $20 at https://devin.ai/pricing. `devin.ai` is the only allowed host. `windsurf.com` is not. Cursor and Windsurf now have v2.3 scores and no pros or cons.
- Scores come from the approved v2.3 file. Pros and cons stay the v1 text for every tool that has them, rated or not. Migration `0007` already deleted the sample Cursor score. The seed writes Cursor’s v2.3 score back and does not restore Cursor pros or cons.
- The tagline is “The right AI in 30 seconds.” The home title is “BestBotFor — The right AI in 30 seconds.”
- The home eyebrow says “Answer 3 quick questions.”
- The not-found page sets its own title, “Page not found | BestBotFor”, its own description, and `noindex, nofollow`. It does not reuse the home canonical or the home social titles.
- Pages publish `og:url` as the absolute canonical URL.
- Sub-page Open Graph and Twitter titles end with “| BestBotFor”. The home `og:description` reuses the home meta description. Best-of titles read “Best AI for making music”.
- Best-of pages use that gerund in the heading, lead, breadcrumb, FAQ, list name, and meta description (“Best AI tool for making music”). Score bars are a valid description list, and Lighthouse scores a rated tool page.
- Home explains the three questions, and the public meta descriptions use the 30-second pick.
- The default Open Graph and Twitter image is the new 1200×630 card, `og-default-1200x630.676bae0e.png`.
- The quiz result shows one pick and up to six alternatives that clear a fit score of 50. When fewer qualify, the page still says few strong options exist.
- All-matches pages list six tools and show “Showing 1–6 of N” with numbered page links. Budget filters stay noindex, rel prev/next and the canonical rules are unchanged, and a page past the end is still a 404.
- Unrated tools hide the ratings section. Pages do not emit AggregateRating or Review schema.
- Pros and cons render as text on the tool page, and a shorter version renders on result cards, only when a still-rated tool has v1 rows. Source URLs stay in the database and are not shown.
- Flowise and Roo Code stay live and show “Unmaintained (repo archived)”. They are left out of quiz picks and alternatives.
- NotebookLM’s public name is Gemini Notebook and its site is https://notebooklm.google/plans. `notebooklm.google` stays on the allowlist. Craft’s category is Productivity. SE Ranking’s category is SEO.
- Tool pages show a bar for features, value, ease, and quality next to the overall stars.
- Quiz results, all-matches lists, and tool pages keep the stars, score bars, pros and cons, and numbered pagination inside the screen at 375, 390, and 768 pixels. Pagination links are at least 44 pixels tall, and text stays at least 12 pixels.
- Text links in the breadcrumbs, best-of lists, footer, and tablet header keep a 44 pixel tap height. Page controls are full-size buttons. The header sits clear of the breadcrumb and “Back to the questions” on a phone, and “See my best bot” stays on screen at 390 pixels.
- Encoded and raw dot segments return 404 from a Vercel route and from the app server. The global `URL` constructor and `http.Server` are no longer patched.
- Quiz result URLs and budget-filtered match lists are `noindex, follow`. `/result?task=X&view=all` page 1 stays indexable and in the sitemap. Lighthouse scores SEO on that indexable list. The production-env check asserts the quiz and budget-filtered pages render `noindex, follow`.
- The first paint uses a metric-matched fallback for every Poppins weight, so the delayed swap does not reflow the tools directory.
- “See all N matches” keeps the quiz budget. Match and quiz titles use the task’s own name.
- `/tools` page numbers that are not a real page return 404, including category filters, so each indexable canonical belongs to one page.
- Encoded dot segments under `/go`, `/best`, and `/tools` return 404 instead of the home page. `/go` responses send `X-Robots-Tag: noindex, nofollow`.
- The catalog seed runs in one transaction. It upserts the catalog, replaces score rows for v2.3-rated tools, deletes score rows for every other tool, and does not delete pros or cons.
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
