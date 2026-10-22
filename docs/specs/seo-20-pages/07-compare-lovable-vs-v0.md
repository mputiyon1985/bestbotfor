# /compare/lovable-vs-v0
**Priority:** P0: fix now (live) · **Template:** EXISTING: src/app/compare/[pair]/page.tsx + src/data/compare-copy.ts · **New template needed:** No
**Overlap with A2 / existing pages:** YES: shipped in PR #54 (9bd4b8b, Oct 17) and in comparePairSeeds + sitemap

## Target keywords
- **Family:** "A vs B" (3.9, P1)
- **Phrases (no volumes measured; validate in Search Console):** lovable vs v0 · lovable or v0 · is lovable better than v0

## Head
- **Title** (— chars): `(unchanged; live from compare-copy.ts)`
- **Meta description** (— chars): `(unchanged; live from compare-copy.ts)`
- **H1:** Lovable vs v0
- **Canonical:** https://bestbotfor.com/compare/lovable-vs-v0 · robots: index, follow

## Outline
1. No new page. Only edit `src/data/compare-copy.ts` per a2-compare-copy/price-recheck-2026-10-18.md:
2. From $30 per user/mo with $30 of included credits → Plus $30 per user/mo (shown as reduced from $90), with $30 of included credits; Lovable Business → $50/mo, or $42/mo billed yearly; Lovable source → lovable.dev/pricing
3. Add internal link: a "Best AI tool for vibe-coding" link to /best/vibe-coding under the table (anchor text from 3.9)

## Data source
src/data/compare-copy.ts (curated) + catalog fit scores at render time; prices: vendor pages checked Oct 17–18

## Internal links
**In (pages that should link here):**
- /best/vibe-coding (new "Compare the top picks" block, see page 11+ notes)
- /tools/lovable and /tools/v0 (existing compare links on tool pages)
- sitemap (already)
**Out (this page links to):**
- /best/vibe-coding
- both /tools profiles (existing)
- /newsletter form (existing CompareNewsletter)

## Acceptance
- Facts render from live catalog data, never typed by hand (except the static guide copy).
- Title ≤ 60 chars, meta ≤ 155. One H1. Breadcrumbs + JSON-LD.
- Newsletter form present (existing component). No Sponsored card unless the page type is approved for one.
- Never use "best", "top" or "recommended" in any sponsor copy (Forge rule).
