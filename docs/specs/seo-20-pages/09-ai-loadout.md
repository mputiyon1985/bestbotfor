# /ai-loadout
**Priority:** P1 · **Template:** NEW (simple static page; reuse NewsletterForm + Breadcrumbs + JsonLd) · **New template needed:** YES
**Overlap with A2 / existing pages:** No

## Target keywords
- **Family:** "Best AI tool for X" (3.9, P1), list intent; lead capture
- **Phrases (no volumes measured; validate in Search Console):** best AI tool for every job · best AI tools list 2026 · AI tools cheat sheet

## Head
- **Title** (48 chars): `The AI Loadout: The Best AI Tool for All 17 Jobs`
- **Meta description** (146 chars): `One top pick for each of 17 jobs, from writing code to making music, from our catalog of 159 tools. Free one-page PDF. The right AI in 30 seconds.`
- **H1:** The AI Loadout: the best bot for all 17 jobs
- **Canonical:** https://bestbotfor.com/ai-loadout · robots: index, follow

## Outline
1. Intro (2 sentences): what it is, picks are editorial, dated
2. The 17 picks as an HTML table rendered LIVE from the catalog (task → top pick → fit → why → link to /best/[task]); do not hard-code the Oct 17 snapshot
3. Email capture: "Get the PDF + The Daily Bot" (NewsletterForm, source=ai-loadout); after submit show the PDF link
4. Direct PDF link also visible (no gating that blocks crawlers or users)
5. "Not sure which job is yours? Answer 3 questions" → /
6. Disclosure line: "Payment never buys a higher rank."

## Data source
listPublicSlugs() tasks + top pick per task (same ranking as /best/[task]); PDF asset: marketing/a3-lead-magnet/ai-loadout.pdf → public/ai-loadout.pdf (regenerate when picks change)

## Internal links
**In (pages that should link here):**
- Homepage (footer or below picker)
- /newsletter page
- each /best/[task] (small "Get the AI Loadout" link)
- Beehiiv welcome email
- social posts
**Out (this page links to):**
- all 17 /best/[task]
- /
- /newsletter

## Acceptance
- Facts render from live catalog data, never typed by hand (except the static guide copy).
- Title ≤ 60 chars, meta ≤ 155. One H1. Breadcrumbs + JSON-LD.
- Newsletter form present (existing component). No Sponsored card unless the page type is approved for one.
- Never use "best", "top" or "recommended" in any sponsor copy (Forge rule).
