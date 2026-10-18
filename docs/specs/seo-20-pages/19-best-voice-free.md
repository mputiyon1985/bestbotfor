# /best/voice/free
**Priority:** P3 (needs a Forge decision on indexing first) · **Template:** NEW nested route src/app/best/[task]/free/page.tsx (reuses the /best/[task] layout + listMatches(tools, "free")) · **New template needed:** YES
**Overlap with A2 / existing pages:** Overlaps /result?task=voice&view=all&budget=free, which is noindex by design (src/lib/result-index.ts: "Budget filters repeat the unfiltered list")

## Target keywords
- **Family:** "Best AI tool for X" (3.9, P1), variant "best free AI for [task]"
- **Phrases (no volumes measured; validate in Search Console):** best free AI for creating a voiceover · free AI voice tool · best free AI voice tool for beginners

## Head
- **Title** (47 chars): `Best Free AI Tool for Create A Voiceover (2026)`
- **Meta description** (147 chars): `The best free AI tool for creating a voiceover, plus up to five free alternatives, with what each free plan includes. Checked against vendor pages.`
- **H1:** Best free AI tool for creating a voiceover
- **Canonical:** https://bestbotfor.com/best/voice/free · robots: index, follow ONLY after the Forge decision; otherwise noindex

## Outline
1. Answer first: "The best free AI tool for creating a voiceover is [top free pick]" (live; today: ElevenLabs)
2. Ranked list of tools with a usable free plan (16 qualify today per /result budget=free), top 6 shown
3. **Unique content that justifies indexing:** per tool, "What the free plan includes / limits" (e.g. credits, minutes, watermark, commercial use), from a new catalog field `freePlanNotes` with source URL + checked date
4. "When to pay" note: the paid pick from /best/voice and what you get for the money
5. CTA: picker with Budget = Free only pre-selected
6. FAQ (2–3) + ItemList JSON-LD

## Data source
listMatches(tools, "free") for task voice; NEW field freePlanNotes per tool (Nova researches from vendor pages; Tony adds to catalog)

## Internal links
**In (pages that should link here):**
- /best/voice ("Only want free tools?" link)
- /tools/[slug] for each listed tool
- /guides/how-to-choose-an-ai-tool
- sitemap (only if indexed)
**Out (this page links to):**
- /best/voice
- /tools/[each]
- /

## Acceptance
- Facts render from live catalog data, never typed by hand (except the static guide copy).
- Title ≤ 60 chars, meta ≤ 155. One H1. Breadcrumbs + JSON-LD.
- Newsletter form present (existing component). No Sponsored card unless the page type is approved for one.
- Never use "best", "top" or "recommended" in any sponsor copy (Forge rule).
