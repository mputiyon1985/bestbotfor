import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@libsql/client'
import { expect, test } from './fixtures'

async function visibleToolCount(): Promise<number> {
  const db = createClient({ url: process.env.TURSO_DATABASE_URL || 'file:./data/e2e.db' })
  try {
    const result = await db.execute("select count(*) as n from tools where status = 'active'")
    return Number(result.rows[0]?.n ?? 0)
  } finally {
    db.close()
  }
}

test('the homepage count is the visible tools in the database', async ({ page }) => {
  const count = await visibleToolCount()
  expect(count).toBeGreaterThan(1)
  const formatted = new Intl.NumberFormat('en-US').format(count)
  const noun = count === 1 ? 'tool' : 'tools'
  await page.goto('/')
  const stat = page.locator('[data-hero-stat]')
  const spoken = await stat.evaluate((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
  expect(spoken).toBe(`${formatted} ${noun} ranked. 1 right pick for you.`)
  expect(spoken.split(formatted).length - 1).toBe(1)
  await expect(page.getByText('AI tools listed')).toHaveCount(0)
  await expect(stat.locator('img')).toHaveCount(0)
  await expect(page.getByText('Answer 3 quick questions', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The right AI in 30 seconds.')
  const light = await new AxeBuilder({ page }).include('[data-hero-stat]').analyze()
  expect(light.violations).toEqual([])
})

test('the stat stacks on a phone and sits in a row on a desktop', async ({ page }) => {
  await page.goto('/')
  const stat = page.locator('[data-hero-stat]')
  const num = stat.locator('[data-hero-count]')
  const copy = stat.locator('[data-hero-copy]')
  const rule = stat.locator('[data-hero-rule]')

  await page.setViewportSize({ width: 375, height: 812 })
  await expect(rule).toBeHidden()
  const phoneNum = await num.boundingBox()
  const phoneCopy = await copy.boundingBox()
  expect(phoneNum).not.toBeNull()
  expect(phoneCopy).not.toBeNull()
  if (!phoneNum || !phoneCopy) return
  expect(phoneCopy.y).toBeGreaterThan(phoneNum.y + phoneNum.height - 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)

  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(rule).toBeVisible()
  const deskNum = await num.boundingBox()
  const deskCopy = await copy.boundingBox()
  const deskRule = await rule.boundingBox()
  expect(deskNum).not.toBeNull()
  expect(deskCopy).not.toBeNull()
  expect(deskRule).not.toBeNull()
  if (!deskNum || !deskCopy || !deskRule) return
  expect(deskCopy.x).toBeGreaterThan(deskNum.x + deskNum.width - 1)
  expect(deskRule.x).toBeGreaterThan(deskNum.x + deskNum.width - 1)
  expect(deskRule.x).toBeLessThan(deskCopy.x)
  const background = await rule.evaluate((el) => getComputedStyle(el).backgroundImage)
  expect(background).toContain('linear-gradient')
  await expect(num).toHaveCSS('color', 'rgb(91, 75, 255)')
  await expect(copy.locator('.text-hero-pick')).toHaveCSS('color', 'rgb(11, 155, 108)')
  const button = page.getByRole('button', { name: 'See my best bot' })
  const buttonBox = await button.boundingBox()
  expect(buttonBox).not.toBeNull()
  if (!buttonBox) return
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(800)
})

test('the stat stays stacked from 768px through 1023px and does not shift', async ({ page }) => {
  await page.addInitScript(() => {
    const record = window as Window & { __cls?: number }
    record.__cls = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number }
        if (!shift.hadRecentInput) record.__cls = (record.__cls ?? 0) + (shift.value ?? 0)
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })

  for (const width of [768, 1023]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const stat = page.locator('[data-hero-stat]')
    const num = stat.locator('[data-hero-count]')
    const copy = stat.locator('[data-hero-copy]')
    const rule = stat.locator('[data-hero-rule]')
    await expect(rule).toBeHidden()
    await expect(stat).toContainText('ranked.')
    const firstNum = await num.boundingBox()
    const firstCopy = await copy.boundingBox()
    expect(firstNum, `${width}px count`).not.toBeNull()
    expect(firstCopy, `${width}px words`).not.toBeNull()
    if (!firstNum || !firstCopy) return
    expect(firstCopy.y, `${width}px stacks the words under the count`).toBeGreaterThan(firstNum.y + firstNum.height - 1)
    expect(Math.abs(firstCopy.x - firstNum.x), `${width}px words share the count's left edge`).toBeLessThan(2)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    expect(overflow, `${width}px has no horizontal scroll`).toBe(true)
    // The font swap is scheduled at 300ms. The stat is on the system face, so its box stays put.
    await page.waitForTimeout(800)
    const laterNum = await num.boundingBox()
    const laterCopy = await copy.boundingBox()
    expect(laterNum).not.toBeNull()
    expect(laterCopy).not.toBeNull()
    if (!laterNum || !laterCopy) return
    expect(Math.abs(laterNum.x - firstNum.x), `${width}px count x`).toBeLessThanOrEqual(1)
    expect(Math.abs(laterNum.y - firstNum.y), `${width}px count y`).toBeLessThanOrEqual(1)
    expect(Math.abs(laterNum.width - firstNum.width), `${width}px count width`).toBeLessThanOrEqual(1)
    expect(Math.abs(laterNum.height - firstNum.height), `${width}px count height`).toBeLessThanOrEqual(1)
    expect(Math.abs(laterCopy.y - firstCopy.y), `${width}px words y`).toBeLessThanOrEqual(1)
    expect(Math.abs(laterCopy.height - firstCopy.height), `${width}px words height`).toBeLessThanOrEqual(1)
    const cls = await page.evaluate(() => (window as Window & { __cls?: number }).__cls ?? 0)
    expect(cls, `${width}px layout shift`).toBeLessThan(0.01)
  }
})

test('the hero stat keeps its contrast in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  const stat = page.locator('[data-hero-stat]')
  await expect(stat.locator('[data-hero-count]')).toHaveCSS('color', 'rgb(46, 230, 168)')
  await expect(stat.locator('.text-hero-pick')).toHaveCSS('color', 'rgb(46, 230, 168)')
  const results = await new AxeBuilder({ page }).include('[data-hero-stat]').analyze()
  expect(results.violations).toEqual([])
})
