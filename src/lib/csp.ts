/**
 * Strict script policy uses a per-request nonce and strict-dynamic.
 * style-src keeps 'unsafe-inline' and does NOT use a nonce: a style nonce
 * makes browsers ignore 'unsafe-inline', which Clerk needs for runtime CSS.
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://js.stripe.com',
    'https://*.js.stripe.com',
    'https://challenges.cloudflare.com',
    'https://*.clerk.accounts.dev',
    'https://*.clerk.com',
    'https://*.protect.clerk.com',
    // Clerk production Frontend API on our custom domain (not covered by *.clerk.com).
    'https://clerk.bestbotfor.com',
    'https://va.vercel-scripts.com',
    isDev ? "'unsafe-eval'" : '',
  ].filter(Boolean)

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://img.clerk.com https://www.google-analytics.com https://www.googletagmanager.com https://clerk.bestbotfor.com",
    "font-src 'self'",
    "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://region1.google-analytics.com https://stats.g.doubleclick.net https://api.stripe.com https://checkout.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://clerk-telemetry.com https://*.clerk-telemetry.com https://*.protect.clerk.com:* https://clerk.bestbotfor.com https://vitals.vercel-insights.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://billing.stripe.com https://challenges.cloudflare.com https://*.protect.clerk.com https://*.clerk.accounts.dev https://clerk.bestbotfor.com https://accounts.bestbotfor.com",
    "worker-src 'self' blob:",
    "form-action 'self' https://accounts.bestbotfor.com",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ]

  return directives.join('; ')
}

export function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-DNS-Prefetch-Control': 'off',
    'X-Permitted-Cross-Domain-Policies': 'none',
  }
}
