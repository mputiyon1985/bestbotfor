/**
 * Where a "Sponsor this page" link goes. The destination is the existing
 * /sponsor flow (in-app founding checkout and the Monthly Payment Link).
 * A task slug only pre-selects that page's /best task. Anything else stays
 * on /sponsor with no query.
 */

const TASK_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function sponsorPageHref(taskSlug?: string | null): string {
  if (!taskSlug || taskSlug.length > 80 || !TASK_SLUG.test(taskSlug)) return '/sponsor'
  return `/sponsor?task=${taskSlug}`
}
