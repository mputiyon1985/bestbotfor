// Images under /email/* are embedded in emails (Gmail loads them through its
// image proxy), so they must be loadable cross-origin. Everything else keeps
// Cross-Origin-Resource-Policy: same-origin.
export const EMAIL_ASSET_SOURCE = '/email/:path*'

export const EMAIL_ASSET_HEADERS = [
  { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
] as const
