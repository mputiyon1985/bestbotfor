import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { toolCategories } from '../src/lib/tool-index'
import { catalogFromSeeds } from '../src/test/catalog-from-seeds'

const category = toolCategories(catalogFromSeeds().tools)[0]
const pages = [
  '/',
  '/sponsor',
  '/newsletter',
  '/best/coding',
  '/tools/chatgpt',
  '/tools',
  category ? `/tools?category=${category.slug}` : '/tools',
  '/result?task=chat&budget=any&skill=beginner',
]

for (const path of pages) {
  test(`${path} has no axe violations`, async ({ page }) => {
    await page.goto(path)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })
}

test('the consent banner does not cover a focused footer link', async ({ page }) => {
  await page.goto('/')
  const link = page.getByRole('navigation', { name: 'Company' }).getByRole('link', { name: 'Privacy', exact: true })
  const banner = page.getByRole('region', { name: 'Analytics cookies' })
  await link.focus()
  const linkBox = await link.boundingBox()
  const bannerBox = await banner.boundingBox()
  expect(linkBox).not.toBeNull()
  expect(bannerBox).not.toBeNull()
  if (!linkBox || !bannerBox) return
  const overlaps = linkBox.y < bannerBox.y + bannerBox.height && linkBox.y + linkBox.height > bannerBox.y && linkBox.x < bannerBox.x + bannerBox.width && linkBox.x + linkBox.width > bannerBox.x
  expect(overlaps).toBe(false)
})
