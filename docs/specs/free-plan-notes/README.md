# Free-plan notes for /best/[task]/free (coding, images, video, voice, meetings)

**Owner:** Forge (catalog) · **Checked:** 2026-10-18 (ET) · **Repo basis:** mputiyon1985/bestbotfor @ main `c65cbe1`

## What this is
These notes are the unique per-tool content that the SEO plan (marketing/seo-20-pages/README.md, pages 16–20) needs before any `/best/[task]/free` page may be indexed. Each one is a one- or two-sentence `freePlanNote` saying what the free plan includes and its key limits, plus `freePlanSource` (the vendor's own pricing or plan page) and `freePlanCheckedAt`.

## Files
- `free-plan-notes.csv`: one row per (page, tool), 76 rows. Columns are `page, task, listOrder, slug, name, status, keepOnPage, freePlanNote, freePlanSource, freePlanCheckedAt, dropReason`.
- `free-plan-notes.by-tool.csv`: the same notes, one row per tool (68 tools). Use this one for the catalog field.

## How the tool lists were built
- This uses the same logic as `listMatches(tools, 'free')` in `src/lib/matches.ts`: fit ≥ 50 (`MIN_QUIZ_FIT_SCORE`), `quizEligible !== false`, and `budgetFit === 'within'` (`pricingModel === 'free' || hasFreeTier`). `src/lib/result-index.ts` noindexes these lists (`matchesRobots`) because they repeat the unfiltered list.
- The lists were read live from `bestbotfor.com/result?task=X&view=all&budget=free` on Oct 18. Voice page 2 kept timing out, so its 6 tools (podcastle, voicemaker, listnr, lalal-ai, descript, fliki) come from the catalog seeds. The seed run gives the same live counts: coding 20 (roo-code is excluded as unmaintained), images 14, video 17, voice 16, meetings 9.
- `listOrder` is for information only. For voice positions 5–10 it follows seed order, not live order. The page renders the live ranking.

## Status values
- `verified`: the note is taken from the vendor's official pricing or plan page as fetched on the check date. `keepOnPage = yes`.
- `not-free`: the official page shows no usable free plan. **Drop the tool from the free page** and fix the catalog.
- `unverified`: the official page did not publish readable free-plan terms. **Leave the tool off the free page** until someone re-checks it. There is no note, so nothing is guessed.

## Counts (verified / listed)
| Page | Listed today | Verified (keep) | Drop |
|---|---|---|---|
| /best/coding/free | 20 | 20 | none |
| /best/images/free | 14 | 13 | picsart (unverified) |
| /best/video/free | 17 | 14 | pika (not-free), pictory (not-free), hedra (unverified) |
| /best/voice/free | 16 | 15 | resemble-ai (not-free) |
| /best/meetings/free | 9 | 9 | none |

Every page still clears the ≥3-free-tools rule.

## Rules followed
- Sources are vendor pages only: pricing pages, plus vendor docs where the pricing page omits the free plan (Replit `docs.replit.com/billing/plans`, Jules `jules.google/docs/usage-limits`, Gemini API `ai.google.dev/gemini-api/docs/pricing`). There are no third-party sources, no logins and no scraping behind auth.
- Each source was fetched with WebFetch or a single public GET of the same page, the same as a browser visit.
- Features shown crossed out on a plan card are treated as **not included**. On Fish Audio, for example, enhanced cloning and commercial use are struck through on Free.

## Caveats for the page template
- **Murf:** the readable page shows the free offer only on the API tab ($10 of API credit). The Studio (voiceover editor) free allowance isn't in the fetched HTML. Re-check it in a browser before launch, or keep the API wording.
- **Ideogram:** there is no free subscription plan, only weekly credits for eligible free accounts (the amount varies). The note says this.
- **Vendor-page inconsistencies:** the note uses the plan card and the README records the conflict.
  - GitHub Copilot: the plan table says "limited chat and agent usage" with 2,000 inline suggestions, but an older FAQ line still says "2000 completions and 50 chat requests".
  - Playground: the Free card says 10 images every 3 hours, but the comparison table says 5 PGv3 images per 3 hours.
- **Commercial-use limits on free plans** (useful for the "When to pay" section): Recraft, Kittl, Scenario, ElevenLabs, Cartesia and Fish Audio don't allow commercial use on free. Typecast requires attribution. Leonardo grants a royalty-free license but keeps its own rights. Playground and Ideogram allow commercial use.
- Prices and allowances change often. Re-check them in the Monday data-freshness routine, and show `freePlanCheckedAt` on the page.

## Catalog corrections found (for Tony's catalog patch)
1. **pictory**: `hasFreeTier` should be `false`. There's only a free trial (3 video projects; the FAQ also mentions a 14-day trial).
2. **pika**: the Free tier has 0 credits a month (packs only). Set `hasFreeTier=false` or keep it off free lists.
3. **resemble-ai**: the site and pricing are now deepfake detection and watermarking ("Multimodal Deepfake Detection and Watermarking for Enterprise"). The $0 Flex tier is pay-as-you-go, with no included TTS usage. Re-check its voice fit and `hasFreeTier`.
4. **podcastle**: podcastle.ai now redirects to async.com, and the product is branded **Async**. Update the URL, allowedHosts, name and logo after review.
5. **kilo-code**: kilocode.ai now redirects to kilo.ai. Update the URL and allowedHosts.
6. **playground**: playground.com now redirects to playgroundai.com. Update the URL and allowedHosts.
7. **runway**: runwayml.com now redirects to runway.com. Update the URL and allowedHosts.
8. **openai-codex**: the pricing doc moved from developers.openai.com/codex/pricing to learn.chatgpt.com/docs/pricing (a redirect). Update the source comment.
9. **picsart, hedra**: the free plan couldn't be verified from the official pricing page. Leave `hasFreeTier` as is, but keep both off free pages until someone re-checks them.
10. **Fit notes worth a look:** speechify's free plan is a listener with 10 robotic voices, not voiceover export. reclaim is a scheduler, not a notetaker. notion-ai's free plan is an AI trial only. These rank via fit scores, which is Forge's call.
