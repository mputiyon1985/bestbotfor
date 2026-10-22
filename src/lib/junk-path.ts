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

export function isJunkPath(pathname: string): boolean {
  return JUNK_PATTERNS.some((pattern) => pattern.test(pathname))
}
