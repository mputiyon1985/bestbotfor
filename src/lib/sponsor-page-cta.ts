/**
 * Where a "Sponsor this page" link goes. The destination is the existing
 * /sponsor flow (in-app founding checkout and the Monthly Payment Link).
 * A task slug only pre-selects that page's /best task. Anything else stays
 * on /sponsor with no query.
 */

const TASK_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * The cap line on the sponsor invitation. Null means the count was not read,
 * so the line stays the cap itself and does not claim spots are open or gone.
 * 0 is sold out. 1 to 5 is how many are left.
 */
export function foundingCapPhrase(spotsLeft: number | null | undefined): string {
  if (spotsLeft == null || !Number.isInteger(spotsLeft) || spotsLeft < 0 || spotsLeft > 5) return 'limited to 5'
  if (spotsLeft === 0) return 'all 5 founding spots are taken'
  return `${spotsLeft} of 5 founding spots left`
}

export function sponsorPageHref(taskSlug?: string | null): string {
  if (!taskSlug || taskSlug.length > 80 || !TASK_SLUG.test(taskSlug)) return '/sponsor'
  return `/sponsor?task=${taskSlug}`
}
