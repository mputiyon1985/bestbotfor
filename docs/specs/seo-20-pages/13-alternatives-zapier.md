# /alternatives/zapier
**Priority:** P2 · **Template:** NEW route /alternatives/[tool] (one template for all; reuse ToolLogo, OutboundLink, Breadcrumbs, ItemList JSON-LD) · **New template needed:** YES
**Overlap with A2 / existing pages:** Partial: links to existing compares where a pair exists

## Target keywords
- **Family:** "[tool] alternatives" (marketing-plan 3.x, "Alternatives pages (phase 2)"); supports "Best AI tool for X"
- **Phrases (no volumes measured; validate in Search Console):** zapier alternatives · apps like zapier · zapier alternative free · best zapier alternative

## Head
- **Title** (52 chars): `Zapier Alternatives: The Best Picks by Budget (2026)`
- **Meta description** (137 chars): `The best Zapier alternatives, ranked by fit and filtered by budget and experience. Free options included. Or get your pick in 30 seconds.`
- **H1:** Zapier alternatives
- **Canonical:** https://bestbotfor.com/alternatives/zapier · robots: index, follow

## Outline
1. Answer first: "The closest Zapier alternative is [#1 non-Zapier tool by fit]," from live data
2. Ranked list (up to 6): tools that fit automation (fit ≥ 50), excluding Zapier; per row: fit %, price label, skill level, one-line why, pros/cons (catalog), link to /tools/[slug] (today this would include e.g. Make, n8n; rendered live, not hard-coded)
3. Filter chips: Free only / Low cost (reuse budget logic from listMatches)
4. "Compare head to head" links to any comparePairSeeds pair that includes Zapier
5. "Why people switch from Zapier" (2–3 bullets from the catalog cons, factual only)
6. CTA: answer 3 questions → /
7. Disclosure line; no Sponsored card on this template in v1

## Data source
Catalog fits for task "automation" (src/data/catalog.ts toolSeeds + scores-v2.3.csv + scores-pros-cons.csv); same ranking as listMatches(tools, budget); Zapier profile cons for the "why switch" bullets

## Internal links
**In (pages that should link here):**
- /tools/zapier (new "Alternatives to Zapier" link)
- /best/automation
- related /compare pages
- sitemap
**Out (this page links to):**
- /tools/zapier
- /best/automation
- /tools/[each alternative]
- /compare pairs
- /

## Acceptance
- Facts render from live catalog data, never typed by hand (except the static guide copy).
- Title ≤ 60 chars, meta ≤ 155. One H1. Breadcrumbs + JSON-LD.
- Newsletter form present (existing component). No Sponsored card unless the page type is approved for one.
- Never use "best", "top" or "recommended" in any sponsor copy (Forge rule).
