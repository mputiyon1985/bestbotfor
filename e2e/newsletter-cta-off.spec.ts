import { expect, test } from '@playwright/test'

// Main server: NEWSLETTER_CTA is blank, so nothing from the CTA renders and the existing forms stay.
for (const path of ['/compare/chatgpt-vs-claude', '/alternatives/chatgpt', '/best/music', '/best/coding/free', '/guides/how-to-choose-an-ai-tool']) {
  test(`${path} renders no newsletter CTA while the flag is off`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('[data-newsletter-cta]')).toHaveCount(0)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(200)
    await expect(page.locator('[data-newsletter-cta]')).toHaveCount(0)
    await expect(page.locator('input[name="cta_path"]')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Get the right AI, every Thursday' })).toHaveCount(0)
  })
}
