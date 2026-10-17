import { rateLimitRetentionKept } from './privacy-copy'

/**
 * Draft lawyer-review package for user ratings (spec 10.1–10.3 and plan A15).
 * Pages render these strings only while userRatingsEnabled() is true.
 */

export const LAWYER_REVIEW_NOTICE =
  'Lawyer review of the ratings drafts and the base policy pages was recorded on October 17, 2026. The written sign-off is a pending link. User ratings are not launched, so this copy is not in effect yet.'

export const PRIVACY_UPDATED = 'October 17, 2026'

export const PRIVACY_UPDATED_WITH_RATINGS =
  `${PRIVACY_UPDATED}. Lawyer review of the ratings and reviews section was recorded on October 17, 2026. The section is not in effect until user ratings launch.`

export const TERMS_UPDATED = 'October 15, 2026'

export const TERMS_UPDATED_WITH_RATINGS =
  'October 17, 2026. Lawyer review of the review-guidelines link was recorded that day. That link is not in effect until user ratings launch.'

export const ATTESTATION =
  "I'm rating this tool from my own experience. I don't work for [Vendor] and I'm not posting on its behalf. Nobody paid me or gave me anything for this rating, and nobody asked me to make it positive or negative. If I have any other connection to [Vendor], I've described it above."

export const TRUST_TIERS = [
  {
    tier: 'Not eligible',
    who: 'Unverified email, or still inside the 72-hour waiting period',
    weight: 'Cannot submit',
  },
  {
    tier: 'Verified',
    who: 'Verified email in the account, and past the waiting period',
    weight: '1.0',
  },
  {
    tier: 'Established',
    who: 'Verified, account at least 90 days old, at least 2 other published reviews on other tools, and no upheld moderation action in the last 180 days',
    weight: '1.5',
  },
] as const

export const MODERATION_REASONS = [
  { code: 'confidential_info', reason: 'Contained trade secrets or confidential business information' },
  { code: 'abusive_content', reason: 'Defamatory, harassing, abusive, obscene, vulgar, or sexually explicit' },
  { code: 'others_personal_info', reason: "Contained someone else's personal information or likeness" },
  { code: 'discriminatory', reason: 'Discriminatory about race, gender, sexuality, ethnicity, or another intrinsic characteristic' },
  { code: 'clearly_false', reason: 'Clearly false or misleading, for example about the wrong product' },
  { code: 'suspected_fake', reason: 'We reasonably believe it is fake, with the evidence noted' },
  { code: 'unrelated', reason: 'Not about this tool' },
  { code: 'vendor_or_insider_undisclosed', reason: 'Written by the vendor or an undisclosed insider' },
  { code: 'spam_or_promotional', reason: 'Ads, links, or promotion' },
  { code: 'duplicate', reason: 'Duplicate of another review' },
] as const

export const GUIDELINES_PARAGRAPHS = [
  'Ratings come from registered users with a verified email. BestBotFor does not write, generate, seed, buy, or import ratings.',
  'There is no payment, perk, contest, or member benefit for posting a rating. We do not ask only people who liked a tool to rate it.',
  'A rating can be submitted after the account is 72 hours old. Each person can have one rating per tool, and they can edit it later. In this version every new rating and every edit waits for a person on our side to approve it before it is published.',
  `Before a rating is saved, the form requires this statement: “${ATTESTATION}”`,
  'If you work for the vendor, the email domain on your account blocks the rating. We compare that domain at submit time and we do not store the email address. Other connections, such as free credits or a relative who works there, can be published only when you describe them. That description is the first line of the rating, and the rating is left out of the user score.',
  'We publish every rating that meets these guidelines, positive or negative. We do not reject or hide a rating because the star value is low or because a vendor dislikes it. There is no reason code for a negative rating.',
  'We do not contact someone to pressure them to change or remove a rating. A vendor complaint uses the same report reasons as anyone else.',
  'You can delete your own rating from your account. Deleting the account deletes your ratings. Rejected or removed text is kept for 180 days and then deleted. The reason code can remain.',
] as const

export const FORMULA_LINES = [
  'User score = round(sum of weight times stars, divided by the sum of weights, to 1 decimal).',
  'The count N is the number of published ratings that count toward the score. It is not a weighted count.',
  'The score is shown only when N is at least 5.',
] as const

export const FORMULA_NOTES = [
  'Only published ratings with no disclosed connection count. Pending, held, rejected, removed, and withdrawn ratings do not. A disclosed connection is left out of the score.',
  'A weight never depends on the stars, the text, or whether the rating is positive or negative. A paid membership does not change a weight or whether a rating is shown.',
  'The highest weight is 1.5, so one Established rating cannot outweigh two Verified ratings.',
  'The star bars are raw counts, not weighted. A worked example: stars 5, 5, 4, 2, and 4 with weights 1.0, 1.5, 1.0, 1.0, and 1.5 equal 24.5 / 6.0, shown as 4.1. The plain average is 4.0. The bars show two 5-star, two 4-star, and one 2-star.',
] as const

export const TRANSPARENCY_PLACEHOLDER =
  'We publish every rating that meets our guidelines, positive or negative. A count of ratings we did not publish, by reason, will be filled in here for the last 90 days once ratings are live. This sentence is a placeholder until those counts exist.'

export const PRIVACY_RATINGS_PARAGRAPHS = [
  'When user ratings are turned on, a public rating stores your Clerk user id, a display-name snapshot in the form “First L.”, the stars, the review text, the use-case selections, any connection disclosure, and the version and time of the statement you checked.',
  'Reviews and that display name are public.',
  'We also store a keyed hash of the IP address and a keyed hash of its network range, the IPv4 /24 or the IPv6 /48, plus the id of the key that produced them. We keep those hashes for 90 days for abuse prevention, then clear them. We do not store the raw IP address, the email address, or a user agent for this feature. At submit time we check the email domain against the vendor’s domain and then discard the email.',
  'In this version a person reviews each rating before it is published. Removal and rejection use only the neutral reasons on the review guidelines. We do not remove a rating because it is negative.',
  'You can delete a rating from your member reviews page. Deleting your Clerk account deletes your ratings, their versions, and reports you filed. We do not keep an anonymized copy of the text.',
  'You can edit a published rating yourself. The previous text stays up until the edit is approved. For access or correction beyond that, email privacy@bestbotfor.com. A downloadable copy of your ratings is planned for a later release and is not available in this draft.',
  'If you accept analytics, rating events can record the tool slug and a result or reason code. They do not include the rating text, the stars, the review id, or your user id.',
] as const

export const RETENTION_ROWS = [
  { data: 'Published rating and its versions', kept: 'Until you delete the rating or your account' },
  { data: 'Rating you deleted', kept: 'Text and versions deleted within 24 hours. An audit row can remain' },
  { data: 'Rejected or removed rating text', kept: '180 days, then the text is deleted. The state and reason code can remain' },
  { data: 'IP hash, network-range hash, and key id on a rating', kept: '90 days, then cleared' },
  { data: 'Reports', kept: '1 year after resolution. The reporter id is replaced with a keyed hash after 180 days' },
  { data: 'Moderation audit rows', kept: '2 years. Reason codes and admin notes only, not the rating text' },
  { data: 'Account-deletion tombstones', kept: '2 years' },
  { data: 'Rate-limit rows', kept: rateLimitRetentionKept() },
]

export const TERMS_RATINGS_PARAGRAPH =
  'User ratings, while that feature is on, are your statements about a tool. They have to follow the review guidelines. You can delete a rating you posted. We may refuse or remove a rating for the reasons on that page. Advertisers cannot edit, remove, or reorder ratings.'

export const DISCLOSURE_ADVERTISER_PARAGRAPH =
  'When a vendor pays BestBotFor for advertising, the tool shows an Advertiser label that says the vendor pays BestBotFor for advertising. Once an affiliate program is approved and a tracking link is actually in use, the label can also say BestBotFor may earn a commission if you buy that tool through our link. Advertisers can’t edit, remove, or reorder reviews, and they don’t affect our ratings. Affiliate links are not live in this draft.'

export function ratingsPolicyCorpus(): string {
  return [
    LAWYER_REVIEW_NOTICE,
    ATTESTATION,
    ...GUIDELINES_PARAGRAPHS,
    ...FORMULA_LINES,
    ...FORMULA_NOTES,
    TRANSPARENCY_PLACEHOLDER,
    ...PRIVACY_RATINGS_PARAGRAPHS,
    ...TRUST_TIERS.flatMap((row) => [row.tier, row.who, row.weight]),
    ...MODERATION_REASONS.flatMap((row) => [row.code, row.reason]),
    ...RETENTION_ROWS.flatMap((row) => [row.data, row.kept]),
    TERMS_RATINGS_PARAGRAPH,
    DISCLOSURE_ADVERTISER_PARAGRAPH,
    PRIVACY_UPDATED_WITH_RATINGS,
    TERMS_UPDATED_WITH_RATINGS,
  ].join('\n')
}
