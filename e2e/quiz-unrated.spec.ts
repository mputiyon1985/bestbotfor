import { expect, test } from '@playwright/test'
import { toolSeeds } from '../src/data/catalog'
import { unratedSlugs } from '../src/data/scores-v23.seed'

const listedUnrated = toolSeeds.filter((tool) => !tool.unlisted && unratedSlugs.includes(tool.slug))
const scoutUnrated = ['dadan', 'composio', 'supercmo', 'mintlify']
  .map((slug) => toolSeeds.find((tool) => tool.slug === slug))
  .filter((tool) => tool && unratedSlugs.includes(tool.slug))

test('unrated tools never appear in quiz results or all matches', async ({ page }) => {
  test.setTimeout(60_000)
  // A few tasks only: /result is rate limited per IP across the whole suite.
  // The unit test (quiz-unrated.test.ts) covers every task, budget and skill.
  const tasks = ['chat', 'music', 'video']
  for (const task of tasks) expect(listedUnrated.some((tool) => tool.fits.some((fit) => fit.task === task)), task).toBe(true)
  for (const task of tasks) {
    const names = listedUnrated.filter((tool) => tool.fits.some((fit) => fit.task === task)).map((tool) => tool.name)
    for (const url of [`/result?task=${task}&budget=any&skill=pro`, `/result?task=${task}&view=all`]) {
      await page.goto(url)
      const main = page.locator('main')
      for (const name of names) {
        await expect(main.getByRole('heading', { name, exact: true }), `${url}: ${name}`).toHaveCount(0)
      }
    }
  }
})

test('unrated tools stay browsable on their category page, labeled Unrated', async ({ page }) => {
  expect(scoutUnrated.length).toBeGreaterThan(0)
  for (const tool of scoutUnrated) {
    if (!tool) continue
    const category = tool.category.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    let found = false
    for (let p = 1; p <= 10 && !found; p += 1) {
      await page.goto(`/tools?category=${category}${p > 1 ? `&page=${p}` : ''}`)
      const card = page.getByRole('list', { name: 'Tools' }).getByRole('listitem').filter({
        has: page.getByRole('link', { name: tool.name, exact: true }),
      })
      if ((await card.count()) === 0) {
        if ((await page.getByRole('link', { name: 'Next page' }).count()) === 0) break
        continue
      }
      found = true
      await expect(card.locator('[data-unrated]')).toHaveText('Unrated')
    }
    expect(found, tool.slug).toBe(true)
  }
  await page.goto('/tools?category=meetings')
  const twinmind = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'TwinMind', exact: true }) })
  if (await twinmind.count()) await expect(twinmind.locator('[data-unrated]')).toHaveCount(0)
})
