export const ROBOTS_HEADER = 'noindex, nofollow'

export const ROBOTS_METADATA = {
  index: false,
  follow: false,
} as const

export function applyPrivacyHeaders(headers: Headers): void {
  headers.set('X-Robots-Tag', ROBOTS_HEADER)
  headers.set('Cache-Control', 'private, no-store')
  headers.set('X-Content-Type-Options', 'nosniff')
}
