/** Vercel sets this to "production" only on the production deployment. Previews stay "preview". */
export function isProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === 'production'
}

export const PREVIEW_ROBOTS_TAG = 'noindex, nofollow'
