/**
 * `priceFromUsd` is the monthly-billed price except these slugs.
 * Their stored price is the annual-billed monthly rate. `priceLabel` shows
 * it as "$X/mo and up, billed annually" for every slug in this list, on every
 * surface, so the amount does not read as a yearly total.
 */
export const ANNUAL_BILLED_SLUGS = ['perplexity', 'lalal-ai', 'agentspot'] as const

const ANNUAL_BILLED = new Set<string>(ANNUAL_BILLED_SLUGS)

export function isAnnualBilledSlug(slug: string | undefined): boolean {
  return slug != null && ANNUAL_BILLED.has(slug)
}

/**
 * A dollar amount that does not already say "/mo". Matches "$1,650" and
 * "$7.50", and leaves "$1,650/mo" alone. The trailing lookahead stops a
 * shorter prefix of a grouped amount ("$1" inside "$1,650") from matching.
 */
function withMonthlyUnit(label: string): string {
  return label.replace(/\$(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?!\/mo)(?![\d.,])/g, (amount) => `${amount}/mo`)
}

/** Adds "/mo" and the annual billing note. Leaves a label that already says so. */
export function withAnnualBilling(slug: string | undefined, label: string): string {
  if (!isAnnualBilledSlug(slug)) return label
  const monthly = withMonthlyUnit(label)
  if (/billed annually/i.test(monthly)) return monthly
  return `${monthly}, billed annually`
}
