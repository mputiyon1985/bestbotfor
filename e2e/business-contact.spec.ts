import { expect, test } from '@playwright/test'

test('rendered HTML: one <head>, Impact meta with value= inside it, phone in footer and JSON-LD', async ({ request }) => {
  for (const path of ['/', '/about', '/how-we-rate']) {
    const html = await (await request.get(path)).text()
    expect(html.match(/<head[\s>]/g)?.length).toBe(1)
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('<meta name="impact-site-verification" value="2b9bb46d-ab24-4ccc-a8a5-93db997140b6"/>')
    expect(html).not.toMatch(/impact-site-verification"[^>]*content=/)
    expect(head).toMatch(/<title>[^<]+<\/title>/)
    expect(html).toContain('href="tel:+15712798182"')
    expect(html).toContain('"telephone":"+15712798182"')
  }
})

test('About shows the phone link', async ({ page }) => {
  await page.goto('/about')
  await expect(page.locator('main a[href="tel:+15712798182"]')).toHaveText('(571) 279-8182')
  await expect(page.locator('footer a[href="tel:+15712798182"]')).toHaveText('(571) 279-8182')
})
