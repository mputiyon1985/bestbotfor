# Affiliate programs

BestBotFor does not run paid search on a vendor’s brand terms. That includes the brand name, a misspelling of the brand, and “brand + coupon”, “brand + discount”, or “brand + review” as a paid keyword. HeyGen’s program requires those terms as negatives, and the same rule applies to every other program. Organic pages and unpaid social posts are not paid search.

## Live programs

ElevenLabs, Synthesia, Descript, Murf, Papermark, DocsAlot, Sendr, Julius AI, Context.dev, and Videco are approved and seeded `active`. Writesonic and Lovable stay `inactive` with no tracking link. Lovable stays off: Impact declined the partnership on Oct 27. Papermark’s Stripe payouts are not connected; the click still uses the tracking link. DocsAlot’s tracking link is `https://docsalot.dev/?utm-source=bestbotfor`. The hyphen in `utm-source` is the vendor’s parameter. `/go/docsalot` does not rewrite it or add `utm_source`, `utm_medium`, or `utm_campaign`. Sendr’s tracking link is `https://sendr.cello.so/LOp5fYtd9Jc`. `/go/sendr` sends that URL, drops any inbound query, and does not add `utm_source`, `utm_medium`, or `utm_campaign`. The commission note is 30% of monthly subscription revenue, up to $5,000 per referral. Julius AI’s catalog slug is `julius-ai`. `/go/julius` is that same tool. Its tracking link is `https://julius.dub.link/mark-putiyon`. `/go/julius` and `/go/julius-ai` send that URL, drop any inbound query, and do not add `utm_source`, `utm_medium`, `utm_campaign`, or `externalId`. No commission rate is stored. The network field is unset, so the Dub SubID is not added. Context.dev’s catalog slug is `context-dev`. Its tracking link is `https://link.context.dev/mark-putiyon`. `/go/context-dev` sends that URL, drops any inbound query, and does not add `utm_source`, `utm_medium`, `utm_campaign`, or `externalId`. No commission rate is stored. The network field is unset, so no SubID is added. DocsAlot’s Startup and Team checkout links are `/go/docsalot-startup` (`https://buy.stripe.com/dRmbJ197SdjH3jRa8f2Ji08`) and `/go/docsalot-team` (`https://buy.stripe.com/eVqbJ1bg02F3f2z4NV2Ji07`). Both are aliases of the `docsalot` catalog row, the same way `/go/julius` is an alias of `julius-ai`. The allowlist pins those two `buy.stripe.com` paths. A bare `buy.stripe.com` host is not listed. `/go/docsalot` stays the Visit link and still sends `https://docsalot.dev/?utm-source=bestbotfor`. Videco’s tracking link is `https://videco.io?via=mark276`. `/go/videco` sends that URL, drops any inbound query, and does not add `utm_source`, `utm_medium`, or `utm_campaign`. The allowlist pins that query. The commission note is `50% recurring`. The network is Endorsely, which has no SubID key, so none is added. Dageno, Databox, and crystl stay `inactive` with no tracking link.

The seed refuses status `active` or an affiliate URL unless that tool’s slug is listed in `APPROVED_ACTIVE_AFFILIATES` in `src/lib/affiliate-admin.ts`. Prebuild runs that seed, so a deploy leaves those ten programs active.

Prepared: ElevenLabs, Synthesia, Descript, Murf, Papermark, DocsAlot, Sendr, Julius AI, Context.dev, Videco, Writesonic, and Lovable. Only the first ten are switched on.

`/go/<slug>` reads `affiliate_programs.affiliate_url` only when that row’s status is exactly `active` and the host is on the tool’s allowlist. A DocsAlot plan alias uses its pinned checkout link instead of that stored URL, and only while the DocsAlot row is active. Every other status redirects to `tools.url`.

## How to set a URL and a status

The admin page at `/admin/affiliates` is read-only. It does not write the database. Status and `affiliate_url` are set from the catalog seed:

1. The owner approves the programs to turn on.
2. In the same commit, add each approved slug to `APPROVED_ACTIVE_AFFILIATES`, set that tool’s `affiliate.status` to `active`, and set `affiliate.affiliateUrl` to the tracking link.
3. Seed. The redirect starts using those URLs on the next deploy. Add only the slugs the owner approved in that commit.

Until that commit, the seed writes `affiliate_url` as null.

## Referrer

Visit links use `rel="sponsored nofollow noopener"` when the program is active, and `rel="nofollow noopener"` otherwise. They do not use `noreferrer`. `noopener` already blocks the opened page from reaching `window.opener`. `noreferrer` would also strip the Referer header. PartnerStack and Impact record that header when they check that the click came from an approved site, so stripping it can drop the commission. Attribution uses the tracking URL and, where the network supports it, a SubID. Sponsored placement cards stay `rel="sponsored nofollow"`.

## SubIDs

When the redirect actually uses an affiliate URL, PartnerStack gets `sid`, Impact gets `subId1`, and Dub gets `externalId`. The value is the page path plus the click id (`/best/voice.42`, or `direct.42` when there is no on-site referrer). The click row stores `affiliate` (0 or 1) and `program_id`. Other networks are not given a made-up parameter. Those networks may set their own cookie after the redirect. That is described on the privacy page.
