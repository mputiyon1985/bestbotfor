# Affiliate programs

BestBotFor does not run paid search on a vendor’s brand terms. That includes the brand name, a misspelling of the brand, and “brand + coupon”, “brand + discount”, or “brand + review” as a paid keyword. HeyGen’s program requires those terms as negatives, and the same rule applies to every other program. Organic pages and unpaid social posts are not paid search.

## Nothing is live in this change

ElevenLabs and Synthesia are approved and seeded `active`, using the tracking links already on main. Descript, Murf, Papermark, Writesonic, and Lovable stay `inactive` with no tracking link. The seed refuses status `active` or an affiliate URL unless that tool’s slug is listed in `APPROVED_ACTIVE_AFFILIATES` in `src/lib/affiliate-admin.ts`. Prebuild runs that seed, so a deploy leaves the two approved programs active.

Prepared, all switched off: ElevenLabs, Synthesia, Descript, Murf, Papermark, Writesonic, and Lovable.

`/go/<slug>` reads `affiliate_programs.affiliate_url` only when that row’s status is exactly `active` and the host is on the tool’s allowlist. Every other status redirects to `tools.url`.

## How to set a URL and a status

The admin page at `/admin/affiliates` is read-only. It does not write the database. Status and `affiliate_url` are set from the catalog seed:

1. The owner approves one program.
2. In the same commit, add that slug to `APPROVED_ACTIVE_AFFILIATES`, set the tool’s `affiliate.status` to `active`, and set `affiliate.affiliateUrl` to the tracking link.
3. Seed. The redirect starts using that URL on the next deploy. Do not activate more than one program in that commit.

Until that commit, the seed writes `affiliate_url` as null.

## Referrer

Visit links use `rel="sponsored nofollow noopener"` when the program is active, and `rel="nofollow noopener"` otherwise. They do not use `noreferrer`. `noopener` already blocks the opened page from reaching `window.opener`. `noreferrer` would also strip the Referer header. PartnerStack and Impact record that header when they check that the click came from an approved site, so stripping it can drop the commission. Attribution uses the tracking URL and, where the network supports it, a SubID. Sponsored placement cards stay `rel="sponsored nofollow"`.

## SubIDs

When the redirect actually uses an affiliate URL, PartnerStack gets `sid`, Impact gets `subId1`, and Dub gets `externalId`. The value is the page path plus the click id (`/best/voice.42`, or `direct.42` when there is no on-site referrer). The click row stores `affiliate` (0 or 1) and `program_id`. Other networks are not given a made-up parameter. Those networks may set their own cookie after the redirect. That is described on the privacy page.
