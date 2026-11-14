/**
 * Member deals the catalog seed upserts. The conflict key is tool slug plus code.
 * `discountText` is required and is shown to non-members, so it does not contain the code.
 * The longer description is `terms`, which only a member view includes.
 * `vendor` is required; it is the catalog vendor for that tool.
 */
export const CONTEXT_DEV_DEAL_START_MS = Date.UTC(2026, 10, 14)

export const dealSeeds = [
  {
    toolSlug: 'context-dev',
    vendor: 'Context.dev',
    title: '25% off for 6 months',
    discountText: '25% off for 6 months',
    code: 'MARK25OFF',
    dealUrl: '/go/context-dev',
    terms: 'New Context.dev users get 25% off for their first 6 months with code MARK25OFF.',
    startsAt: CONTEXT_DEV_DEAL_START_MS,
    expiresAt: null,
    active: true,
    createdAt: CONTEXT_DEV_DEAL_START_MS,
  },
] as const
