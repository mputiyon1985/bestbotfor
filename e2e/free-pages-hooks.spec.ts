import { expect, test } from '@playwright/test'
import { FREE_PAGE_TASKS } from '../src/lib/free-plan'
import { FREE_PLAN_DROP_HEADER, FREE_PLAN_NOW_HEADER } from '../src/lib/free-page-hooks'

// Runs against the BBF_E2E_HOOKS=1 server (playwright project free-plan-hooks).
// Notes were checked 2026-10-18 to 2026-10-22, so 2026-10-23 is fresh and 2027-03-01 is stale.
const FRESH = '2026-10-23'
const STALE = '2027-03-01'

test.describe('free page index gate', () => {
  test('fresh notes: the page is indexable and listed in the sitemap', async ({ page, request }) => {
    await page.setExtraHTTPHeaders({ [FREE_PLAN_NOW_HEADER]: FRESH })
    for (const task of FREE_PAGE_TASKS) {
      await page.goto(`/best/${task}/free`)
      await expect(page.locator('article[data-free-plan-index]')).toHaveAttribute('data-free-plan-index', 'index')
      await expect(page.locator('[data-free-plan-status="fresh"]')).toHaveCount(6)
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Checked against vendor pages/)
    }
    const body = await (await request.get('/sitemap.xml', { headers: { [FREE_PLAN_NOW_HEADER]: FRESH } })).text()
    for (const task of FREE_PAGE_TASKS) expect(body).toContain(`/best/${task}/free</loc>`)
  })

  test('stale notes: the page goes back to noindex and leaves the sitemap', async ({ page, request }) => {
    await page.setExtraHTTPHeaders({ [FREE_PLAN_NOW_HEADER]: STALE })
    await page.goto('/best/coding/free')
    await expect(page.locator('article[data-free-plan-index]')).toHaveAttribute('data-free-plan-index', 'noindex')
    await expect(page.locator('[data-free-plan-status="stale"]')).toHaveCount(6)
    await expect(page.getByRole('note')).toContainText('have not been checked recently')
    await expect(page.getByText('This check is more than 90 days old.').first()).toBeVisible()
    await expect(page.locator('meta[name="description"]')).not.toHaveAttribute('content', /Checked against vendor pages/)
    const body = await (await request.get('/sitemap.xml', { headers: { [FREE_PLAN_NOW_HEADER]: STALE } })).text()
    for (const task of FREE_PAGE_TASKS) expect(body).not.toContain(`/best/${task}/free</loc>`)
  })

  test('a missing note: the page goes back to noindex and leaves the sitemap', async ({ page, request }) => {
    const headers = { [FREE_PLAN_NOW_HEADER]: FRESH, [FREE_PLAN_DROP_HEADER]: 'cursor' }
    await page.setExtraHTTPHeaders(headers)
    await page.goto('/best/coding/free')
    await expect(page.locator('article[data-free-plan-index]')).toHaveAttribute('data-free-plan-index', 'noindex')
    await expect(page.locator('[data-free-plan-status="missing"]')).toHaveCount(1)
    await expect(page.getByText('We have not checked this free plan yet.')).toBeVisible()
    await page.goto('/best/images/free')
    await expect(page.locator('article[data-free-plan-index]')).toHaveAttribute('data-free-plan-index', 'index')
    const body = await (await request.get('/sitemap.xml', { headers })).text()
    expect(body).not.toContain('/best/coding/free</loc>')
  })
})
