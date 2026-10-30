export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!origin || !host) return false
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
