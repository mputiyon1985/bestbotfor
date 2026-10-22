import { expect, test, type Page } from '@playwright/test'

// Runs on the newsletter-cta-on server (NEWSLETTER_CTA=on, VERCEL_ENV=test).

const PAGES = [
  { path: '/compare/chatgpt-vs-claude' },
  { path: '/compare/cursor-vs-windsurf' },
  { path: '/alternatives/chatgpt' },
  { path: '/alternatives/jasper' },
  { path: '/best/music' },
  { path: '/best/coding/free' },
  { path: '/guides/how-to-choose-an-ai-tool' },
]

function inline(page: Page) {
  return page.locator('[data-newsletter-cta="inline"]')
}
function bar(page: Page) {
  return page.locator('[data-newsletter-cta="bar"]')
}
async function scrollTo(page: Page, fraction: number) {
  await page.evaluate((f) => {
    const doc = document.documentElement
    window.scrollTo(0, (doc.scrollHeight - window.innerHeight) * f)
  }, fraction)
}

for (const { path } of PAGES) {
  test(`${path} shows one inline CTA under the verdict and no other Daily Bot form`, async ({ page }) => {
    await page.goto(path)
    await expect(inline(page)).toHaveCount(1)
    await expect(inline(page).getByRole('heading', { name: 'Get the right AI, every Thursday' })).toBeVisible()
    await expect(inline(page).getByText('The Daily Bot: the right AI for one job, every Thursday. Free.')).toBeVisible()
    await expect(inline(page).getByRole('button', { name: 'Send me The Daily Bot' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'The Daily Bot' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: /The Daily Bot (after the table|at the end of the page)/ })).toHaveCount(0)
    const h1 = await page.getByRole('heading', { level: 1 }).boundingBox()
    const box = await inline(page).boundingBox()
    expect(box!.y).toBeGreaterThan(h1!.y)
    await expect(inline(page).locator('input[name="cta_path"]')).toHaveValue(path)
  })
}

test('the sticky bar appears after 40% scroll and a dismissal persists', async ({ page }) => {
  await page.goto('/best/music')
  await expect(bar(page)).toHaveCount(0)
  await scrollTo(page, 0.5)
  await expect(bar(page)).toBeVisible()
  await page.locator('[data-newsletter-cta-dismiss]').click()
  await expect(bar(page)).toHaveCount(0)
  const stored = await page.evaluate(() => window.localStorage.getItem('bbf_newsletter_cta_dismissed'))
  expect(Number(stored)).toBeGreaterThan(0)
  await page.goto('/compare/chatgpt-vs-claude')
  await scrollTo(page, 0.6)
  await page.waitForTimeout(300)
  await expect(bar(page)).toHaveCount(0)
  // An 8-day-old dismissal has expired.
  await page.evaluate(() => window.localStorage.setItem('bbf_newsletter_cta_dismissed', String(Date.now() - 8 * 24 * 60 * 60 * 1000)))
  await page.reload()
  await scrollTo(page, 0.6)
  await expect(bar(page)).toBeVisible()
})

test('on mobile the bar hides while the inline box is in view', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await page.goto('/best/music')
  await scrollTo(page, 0.5)
  await expect(bar(page)).toBeVisible()
  await inline(page).scrollIntoViewIfNeeded()
  // Only hidden while the inline box is on screen; if it sits above 40% the bar was never shown here.
  await expect(bar(page)).toHaveCount(0)
  await context.close()
})

test('submitting posts the page path and utm tags and shows an inline thank-you', async ({ page }) => {
  const path = '/alternatives/chatgpt'
  await page.goto(`${path}?utm_source=e2e&utm_medium=email&utm_campaign=cta_test`)
  const bodies: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST') bodies.push(request.postData() ?? '')
  })
  await expect(inline(page).locator('input[name="first_touch"]')).toHaveValue(/utm_source/)
  await inline(page).getByLabel('Email address').fill('cta-e2e@example.com')
  await inline(page).getByRole('button', { name: 'Send me The Daily Bot' }).click()
  await expect(inline(page).locator('[data-newsletter-cta-thanks]')).toHaveText('Almost done. Check your inbox.')
  await expect(inline(page).locator('form')).toHaveCount(0)
  expect(new URL(page.url()).pathname).toBe(path)
  const posted = bodies.find((body) => body.includes('cta-e2e@example.com')) ?? ''
  expect(posted).toContain(path)
  expect(posted).toContain('cta_path')
  expect(posted).toContain('utm_source')
  expect(posted).toContain('e2e')
  expect(posted).toContain('cta_test')
})

test('an invalid email shows an error inline and keeps the form', async ({ page }) => {
  await page.goto('/guides/how-to-choose-an-ai-tool')
  await inline(page).getByLabel('Email address').fill('nope')
  await inline(page).getByRole('button', { name: 'Send me The Daily Bot' }).click()
  await expect(inline(page).getByText('Enter a valid email address.')).toBeVisible()
  await expect(inline(page).locator('form')).toHaveCount(1)
})

test('the privacy policy names the CTA pages while the flag is on', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByText(/or any page under \/compare\/, \/alternatives\/, \/best\/, or \/guides\//)).toBeVisible()
})

test('the bar sits at the end of <body>, never covers the footer, and its dismiss button shows focus', async ({ page }) => {
  await page.goto('/best/music')
  await scrollTo(page, 0.5)
  await expect(bar(page)).toBeVisible()
  const last = await page.evaluate(() => {
    const kids = Array.from(document.body.children).filter((el) => el.tagName !== 'SCRIPT' && el.tagName !== 'NEXT-ROUTE-ANNOUNCER')
    return kids.at(-1)?.getAttribute('data-newsletter-cta')
  })
  expect(last).toBe('bar')
  const footerFirst = await page.evaluate(() => {
    const footer = document.querySelector('footer')
    const b = document.querySelector('[data-newsletter-cta="bar"]')
    return Boolean(footer && b && footer.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(footerFirst).toBe(true)
  await scrollTo(page, 1)
  // Scrolling may be smooth; wait until the page reaches the bottom, then the footer must end above the bar.
  await expect
    .poll(() => page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1))
    .toBe(true)
  const gap = await page.evaluate(() => {
    const footer = document.querySelector('footer')!.getBoundingClientRect()
    const b = document.querySelector('[data-newsletter-cta="bar"]')!.getBoundingClientRect()
    return b.top - footer.bottom
  })
  expect(gap).toBeGreaterThanOrEqual(-1)
  const dismiss = page.locator('[data-newsletter-cta-dismiss]')
  await dismiss.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(dismiss).toBeFocused()
  const outline = await dismiss.evaluate((el) => getComputedStyle(el).outlineStyle)
  expect(outline).not.toBe('none')
})
