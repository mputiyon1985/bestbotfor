# 20 SEO pages: build spec for Tony and Forge

**Status:** spec / PR-ready handoff · written Oct 18, 2026 (ET) · source plan: `marketing/audience-growth-30day.md` section 1 (approved, free items only)
**Repo checked:** mputiyon1985/bestbotfor @ origin/main `c65cbe1` · live checks on bestbotfor.com Oct 18
**Rules:** facts render from catalog data (no hand-typed scores or prices); no search volumes were measured, so keyword phrases are targets to validate in Search Console, not traffic claims; no Sponsored cards on new templates in v1; sponsor copy never says best, top or recommended.

## What exists in the repo today
| Route | File | Notes |
|---|---|---|
| `/best/[task]` (17) | `src/app/best/[task]/page.tsx` | One pick + up to six alternatives; links to /tools only (no compare links) |
| `/compare/[pair]` (19 pairs) | `src/app/compare/[pair]/page.tsx` + `src/data/compare-copy.ts` | Pairs in `comparePairSeeds` (catalog.ts); curated copy for the 8 A2 pairs from PR #54 |
| `/tools`, `/tools/[slug]` (159) | `src/app/tools/...` | Tool page links to /best/[task] and to compare pairs |
| `/result?task=X&view=all[&budget=]` | `src/lib/matches.ts`, `src/lib/result-index.ts` | **Budget-filtered lists are noindex by design** ("repeat the unfiltered list with rows removed") |
| `/best` (index) | none | **404 live.** Recommended extra: a /best hub listing the 17 jobs |
| `/guides/*`, `/alternatives/*`, `/best/[task]/free`, `/ai-loadout` | none | All 404 live (caught by `[...slug]`). **These need new routes** |
| Sitemap | `src/app/sitemap.ts` | Static paths + /best, matches, /tools, compares. Each new route must be added |

## Priority order and summary
| # | URL | Keyword family (marketing-plan 3.9) | Template | New template? | Overlaps A2 / PR #54 |
|---|---|---|---|---|---|
| 1 | /compare/elevenlabs-vs-murf | A vs B | compare | No | **Yes, live.** Drop [S] on Murf prices |
| 2 | /compare/n8n-vs-make | A vs B | compare | No | **Yes, live.** Make Core $9/$10.59 → **$12 yearly / $16 monthly**; "1,000+" → "3,500+ apps" |
| 3 | /compare/heygen-vs-synthesia | A vs B | compare | No | **Yes, live.** No change |
| 4 | /compare/descript-vs-runway | A vs B | compare | No | **Yes, live.** No change |
| 5 | /compare/granola-vs-fathom | A vs B | compare | No | **Yes, live.** No change |
| 6 | /compare/fathom-vs-fireflies | A vs B | compare | No | **Yes, live.** No change |
| 7 | /compare/lovable-vs-v0 | A vs B | compare | No | **Yes, live.** v0 "Plus $30 (shown reduced from $90)"; Lovable Business $50/$42 |
| 8 | /compare/assemblyai-vs-deepgram | A vs B | compare | No | **Yes, live.** No change |
| 9 | /ai-loadout | Best AI tool for X (list) + lead capture | static landing | **Yes** | No |
| 10 | /guides/how-to-choose-an-ai-tool | Choosing + Which AI should I use | guide | **Yes** (/guides/[slug]) | No |
| 11 | /alternatives/chatgpt | [tool] alternatives | alternatives | **Yes** (/alternatives/[tool]) | No |
| 12 | /alternatives/midjourney | [tool] alternatives | alternatives | (same template) | No |
| 13 | /alternatives/zapier | [tool] alternatives | alternatives | (same) | Links /compare/n8n-vs-make area |
| 14 | /alternatives/cursor | [tool] alternatives | alternatives | (same) | No |
| 15 | /alternatives/elevenlabs | [tool] alternatives | alternatives | (same) | Links /compare/elevenlabs-vs-murf |
| 16 | /best/coding/free | Best AI tool for X (free) | best-free | **Yes** (/best/[task]/free) | Duplicates noindexed /result budget=free |
| 17 | /best/images/free | same | best-free | (same) | same |
| 18 | /best/video/free | same | best-free | (same) | same |
| 19 | /best/voice/free | same | best-free | (same) | same |
| 20 | /best/meetings/free | same | best-free | (same) | same |

**Why this order:** 1–8 are live pages where fixes are one edit to `compare-copy.ts` and wrong prices hurt trust (do it first, about 30 min). 9–10 support email capture and the hub structure. 11–15 is one template, 5 pages. 16–20 waits on a decision (below).

**New templates needed (4):** `/ai-loadout` (static), `/guides/[slug]`, `/alternatives/[tool]`, `/best/[task]/free`. **Existing templates:** the 8 compares (no new page; content fixes only).

## Overlap with the A2 compares (PR #54)
PR #54 (`9bd4b8b`, merged Oct 17 7:29 PM ET) shipped curated copy for all 8 pairs. They are in `comparePairSeeds` and the sitemap and load live. **So pages 1–8 are not new builds.** What's left is a small follow-up PR to `src/data/compare-copy.ts`, using `marketing/a2-compare-copy/price-recheck-2026-10-18.md`. Main still has the old strings: Make `Core $9/mo billed yearly or $10.59 monthly` (line 176), Make `1,000+ app integrations` (line 157), Murf `[S]` markers (line 110), v0 `From $30 per user/mo` (line 490). Also add a link from each compare to its `/best/[task]`.

## Decision needed from Forge (blocks 16–20)
`result-index.ts` noindexes budget-filtered lists on purpose. A `/best/[task]/free` page that only filters the same list would be the near-duplicate the code avoids. **Proposal:** index it only if each page carries unique content: a per-tool "what the free plan includes / limits" note (new catalog field `freePlanNotes` + source URL + checked date) plus a "when to pay" section. Otherwise ship it as noindex (useful for social links) or skip it. Every one of the 5 tasks qualifies on the ≥3-free-tools rule. Live free-budget counts on Oct 18: coding 20, images 14, video 17, voice 16, meetings 9.

## Internal linking plan (new links to add to existing templates)
- `/best/[task]` → "Only want free tools?" (/best/[task]/free), "Compare the top picks" (comparePairSeeds pairs for that task), "How to choose" guide, "Get the AI Loadout".
- `/tools/[slug]` → "Alternatives to X" when an /alternatives page exists.
- `/compare/[pair]` → `/best/[task]`.
- Homepage → guide + /ai-loadout (footer or under the picker). Optional /best hub (currently 404).
- Sitemap: add `/ai-loadout`, `/guides/how-to-choose-an-ai-tool`, 5 × `/alternatives/*`, and `/best/*/free` (only if indexed).

## Files
`01`–`08` compares (fix specs) · `09-ai-loadout.md` · `10-guide-how-to-choose-an-ai-tool.md` · `11`–`15` alternatives · `16`–`20` best-free. Each has title (≤60), meta (≤155), H1, outline, data source, internal links in/out and acceptance criteria. Regenerate with `python3 .generate.py`.
