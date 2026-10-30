const SEGMENT = /^([A-Za-z0-9._~-]+)$/
const QUERY = /^([A-Za-z0-9._~%=&+-]{0,200})$/
const SAFE_LOCATION = /^(\/[Aa][Dd][Mm][Ii][Nn](?:\/[A-Za-z0-9._~-]+)*)(\?[A-Za-z0-9._~%=&+-]{0,200})?$/

/**
 * Next answers a repeated slash (`/admin/signups//`) with its own 308 before
 * the proxy runs, and that response has no noindex or no-store header.
 * Collapse those admin paths here. The result is rebuilt from safe segments,
 * so it cannot be an absolute or protocol-relative URL. A public path returns
 * null so Next keeps its own redirect.
 */
export function adminCollapsedRedirect(rawUrl: string): string | null {
  const noHash = rawUrl.split('#')[0] ?? ''
  const path = noHash.split('?')[0] ?? ''
  const rawQuery = noHash.includes('?') ? (noHash.split('?').slice(1).join('?') ?? '') : ''
  if (!path.startsWith('/admin') && !path.toLowerCase().startsWith('/admin')) return null
  if (path.includes('\\') || path.includes('\0') || /[\r\n]/.test(path)) return null
  const collapsed = path.replace(/\/{2,}/g, '/')
  const stripped = collapsed.length > 1 ? collapsed.replace(/\/+$/, '') || '/' : collapsed
  if (stripped === path) return null
  const safe: string[] = []
  for (const part of stripped.split('/')) {
    if (!part) continue
    const matched = SEGMENT.exec(part)
    if (!matched?.[1]) return null
    safe.push(matched[1])
  }
  if (safe[0]?.toLowerCase() !== 'admin') return null
  let query = ''
  if (rawQuery) {
    const matched = QUERY.exec(rawQuery)
    if (matched?.[1] && !matched[1].includes('//')) query = `?${matched[1]}`
  }
  const location = `/${safe.join('/')}${query}`
  const checked = SAFE_LOCATION.exec(location)
  if (!checked?.[1]) return null
  if (checked[1].includes('//') || checked[1].startsWith('//')) return null
  return `${checked[1]}${checked[2] ?? ''}`
}
