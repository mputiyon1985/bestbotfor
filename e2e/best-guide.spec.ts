import { BEST_GUIDE_FIT_LEGEND } from '../src/lib/descriptions'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { BEST_GUIDE_TOOL_COUNT } from '../src/lib/descriptions'
import { toolsForTask } from '../src/lib/recommend'
import { catalogFromSeeds } from '../src/test/catalog-from-seeds'

const catalog = catalogFromSeeds()

/** Vertical span of the text, so a single line stays within one line box. */
async function textLineHeight(locator: Locator) {
  return locator.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const rects = [...range.getClientRects()]
    if (rects.length === 0) return { height: 0, line: 0 }
    const top = Math.min(...rects.map((rect) => rect.top))
    const bottom = Math.max(...rects.map((rect) => rect.bottom))
    return { height: bottom - top, line: Math.max(...rects.map((rect) => rect.height)) }
  })
}

async function expectSingleLine(locator: Locator, label: string) {
  const metrics = await textLineHeight(locator)
  expect(metrics.line, label).toBeGreaterThan(0)
  expect(metrics.height, label).toBeLessThanOrEqual(metrics.line + 1)
}

async function expectFitOnOneLine(page: Page) {
  const pills = page.getByText(/^\d+% match$/).filter({ visible: true })
  const count = await pills.count()
  expect(count).toBe(BEST_GUIDE_TOOL_COUNT)
  for (let index = 0; index < count; index += 1) {
    const pill = pills.nth(index)
    await expectSingleLine(pill, `fit pill ${index}`)
    await expect(pill).toHaveCSS('white-space', 'nowrap')
  }
}

test.describe('best guide rankings', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: 'bbf_consent', value: 'denied', url: 'http://127.0.0.1:3000' }])
  })

  for (const viewport of [
    { width: 1024, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`coding guide at ${viewport.width}px keeps fit on one line`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/best/coding')
      const ranked = toolsForTask(catalog, 'coding')
      expect(ranked.length).toBeGreaterThan(BEST_GUIDE_TOOL_COUNT)

      await expect(page.getByText(BEST_GUIDE_FIT_LEGEND, { exact: true })).toBeVisible()
      await expectFitOnOneLine(page)

      const mobile = viewport.width < 768
      const rankings = mobile
        ? page.getByRole('list', { name: 'Tools ranked for writing code' })
        : page.getByRole('table', { name: 'Tools ranked for writing code' })
      const entries = mobile ? rankings.getByRole('listitem') : rankings.getByRole('row')
      const entryCount = await entries.count()
      expect(mobile ? entryCount : entryCount - 1).toBe(BEST_GUIDE_TOOL_COUNT)

      const logos = rankings.getByRole('img', { name: / logo$/ })
      expect(await logos.count()).toBe(BEST_GUIDE_TOOL_COUNT)
      const logoBox = await logos.first().boundingBox()
      expect(logoBox).not.toBeNull()
      expect(Math.round(logoBox?.width ?? 0)).toBe(40)
      expect(Math.round(logoBox?.height ?? 0)).toBe(40)

      if (!mobile) {
        const header = page.getByRole('columnheader', { name: 'Match', exact: true })
        await expectSingleLine(header, 'Match header')
        await expect(header).toHaveCSS('white-space', 'nowrap')
        await expect(header).toHaveAttribute('aria-describedby', 'fit-legend')
      }

      if (viewport.width === 390) {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow).toBeLessThanOrEqual(1)
      }

      for (const tool of ranked.slice(0, BEST_GUIDE_TOOL_COUNT)) {
        await expect(rankings.getByRole('link', { name: tool.name, exact: true })).toBeVisible()
      }

      const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
      const itemList = blocks
        .map((text) => JSON.parse(text) as { '@type'?: string; itemListElement?: unknown[] })
        .find((block) => block['@type'] === 'ItemList')
      expect(itemList?.itemListElement).toHaveLength(BEST_GUIDE_TOOL_COUNT)

      const allMatches = page.getByRole('link', { name: 'See all matches' })
      await expect(allMatches).toHaveAttribute('href', '/result?task=coding&view=all')
      const response = await page.request.get('/result?task=coding&view=all')
      expect(response.ok()).toBe(true)
      await allMatches.click()
      await expect(page).toHaveURL(/\/result\?task=coding&view=all/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Write code matches')
    })
  }
})
