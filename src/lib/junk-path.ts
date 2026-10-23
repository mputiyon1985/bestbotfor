/**
 * Scanner probes (WordPress, PHP, dotfiles) that no BestBotFor route serves.
 * The proxy answers them with a bare 404 before Clerk, the /result gate or any
 * render, so they never reach the catch-all page or the database.
 */
const JUNK_PATTERNS: RegExp[] = [
  /^\/wp-/i, // /wp-admin, /wp-login.php, /wp-content/...
  /\/wordpress(\/|$)/i,
  /\/xmlrpc\.php$/i,
  /\.php\d?(\/|$)/i,
  /\/\.env(\.|\/|$)/i,
  /\/\.git(\/|$)/i,
  /\/\.(aws|ssh|svn|hg|DS_Store|htaccess|htpasswd)(\/|$)/i,
  /\/cgi-bin(\/|$)/i,
  /\.(asp|aspx|jsp|cgi)$/i,
]

/**
 * Repeatedly percent-decodes (max 3 passes, so `%252e` is caught) and strips
 * NUL bytes. A malformed escape stops decoding and keeps the last good form;
 * it never throws. Repeated slashes collapse so `//wp-admin` matches.
 */
export function normalizeProbePath(pathname: string): string {
  let current = pathname
  for (let pass = 0; pass < 3; pass += 1) {
    let decoded: string
    try {
      decoded = decodeURIComponent(current)
    } catch {
      break
    }
    if (decoded === current) break
    current = decoded
  }
  return current.replace(/\0/g, '').replace(/\/{2,}/g, '/')
}

export function isJunkPath(pathname: string): boolean {
  const candidates = new Set([pathname, normalizeProbePath(pathname)])
  for (const candidate of candidates) {
    if (JUNK_PATTERNS.some((pattern) => pattern.test(candidate))) return true
  }
  return false
}
