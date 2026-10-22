/** Shared CDN caching for public, catalog-only text routes (llms.txt, llms-full.txt). Daily, with a day of stale-while-revalidate. */
export const LLMS_CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
