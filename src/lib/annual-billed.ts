/**
 * `priceFromUsd` is the monthly-billed price except these slugs.
 * Their stored price is the annual-billed rate. `priceLabel` appends
 * ", billed annually" for every slug in this list, on every surface.
 */
export const ANNUAL_BILLED_SLUGS = ['perplexity', 'lalal-ai', 'agentspot'] as const

const ANNUAL_BILLED = new Set<string>(ANNUAL_BILLED_SLUGS)

export function isAnnualBilledSlug(slug: string | undefined): boolean {
  return slug != null && ANNUAL_BILLED.has(slug)
}

/** Adds the annual billing note to a price label. Leaves a label that already says so. */
export function withAnnualBilling(slug: string | undefined, label: string): string {
  if (!isAnnualBilledSlug(slug) || /billed annually/i.test(label)) return label
  return `${label}, billed annually`
}
