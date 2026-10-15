/**
 * Page views must not carry free text. The search box puts what someone
 * typed in `q`, and GA4 would store that on `page_location` and `page_path`.
 */
export function redactAnalyticsUrl(href: string): string {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return href
  }
  const keys = [...url.searchParams.keys()]
  for (const key of keys) {
    if (key.toLowerCase() === 'q') url.searchParams.delete(key)
  }
  url.hash = ''
  return url.toString()
}

/** GA must not send its own page view. The app sends a redacted one instead. */
export function googleAnalyticsBootstrap(gaId: string): string {
  return `
gtag('js', new Date());
gtag('config', '${gaId}', { send_page_view: false });
`
}

export function analyticsPageView(input: { href: string; referrer?: string }): {
  page_location: string
  page_path: string
  page_referrer?: string
} {
  const pageLocation = redactAnalyticsUrl(input.href)
  const page = new URL(pageLocation)
  const view: { page_location: string; page_path: string; page_referrer?: string } = {
    page_location: pageLocation,
    page_path: `${page.pathname}${page.search}`,
  }
  if (input.referrer) view.page_referrer = redactAnalyticsUrl(input.referrer)
  return view
}
