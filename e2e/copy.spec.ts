import { expect, test } from '@playwright/test'
import { PICKER_QUESTIONS } from '../src/components/picker-form'
import { recommend } from '../src/lib/recommend'
import { catalogFromSeeds } from '../src/test/catalog-from-seeds'

const answers = { task: 'chat', budget: 'any', skill: 'beginner' } as const

test('sub-page Open Graph and Twitter titles include the brand', async ({ page }) => {
  const cases = [
    ['/about', 'About'],
    ['/tools', 'Tools'],
    ['/pricing', 'Pricing'],
    ['/best/music', 'Best AI for making music'],
  ] as const
  for (const [path, title] of cases) {
    await page.goto(path)
    const branded = `${title} | BestBotFor`
    await expect(page.locator('meta[property="og:title"]'), path).toHaveAttribute('content', branded)
    await expect(page.locator('meta[name="twitter:title"]'), path).toHaveAttribute('content', branded)
    await expect(page, path).toHaveTitle(`${title} · BestBotFor`)
  }
})

test('pages publish og:url as the absolute canonical', async ({ page }) => {
  for (const path of ['/about', '/tools', '/pricing']) {
    await page.goto(path)
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
    expect(canonical, path).toMatch(/^https?:\/\//)
    expect(canonical, path).toContain(path)
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical ?? '')
  }
})

test('how it works names the same three questions as the picker', async ({ page }) => {
  await page.goto('/')
  const section = page.getByRole('region', { name: 'How it works: three questions, about 30 seconds' })
  await expect(section).toBeVisible()
  await expect(page.getByText('Does it really take 30 seconds?')).toBeVisible()
  for (const question of PICKER_QUESTIONS) {
    await expect(section.getByText(question, { exact: true })).toBeVisible()
    await expect(page.getByRole('group', { name: question })).toBeVisible()
  }
})

test('the scripted picker reaches a result within a few seconds', async ({ page }) => {
  const pick = recommend(catalogFromSeeds(), answers)?.picks[0]
  expect(pick).toBeTruthy()
  if (!pick) return

  await page.goto('/')
  const started = Date.now()
  await page.getByLabel('Pick the closest job.').selectOption(answers.task)
  await page.getByRole('radio', { name: 'Any budget' }).check()
  await page.getByRole('radio', { name: 'Beginner' }).check()
  await page.getByRole('button', { name: 'See my best bot' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(pick.name)
  expect(Date.now() - started).toBeLessThan(5_000)
})
