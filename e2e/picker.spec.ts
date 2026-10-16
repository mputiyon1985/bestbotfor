import { expect, test } from '@playwright/test'
import { catalogFromSeeds } from '../src/test/catalog-from-seeds'
import { recommend } from '../src/lib/recommend'

const answers = { task: 'chat', budget: 'any', skill: 'beginner' } as const

test('three questions produce one pick and alternatives', async ({ page }) => {
  const pick = recommend(catalogFromSeeds(), answers)?.picks[0]
  expect(pick).toBeTruthy()
  if (!pick) return

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three questions. One best bot.')
  await page.getByLabel('Pick the closest job.').selectOption(answers.task)
  await page.getByRole('radio', { name: 'Any budget' }).check()
  await page.getByRole('radio', { name: 'Beginner' }).check()
  await page.getByRole('button', { name: 'See my best bot' }).click()
  await expect(page).toHaveURL(new RegExp(`/result\\?task=${answers.task}&budget=${answers.budget}&skill=${answers.skill}`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(pick.name)
  await expect(page.getByRole('heading', { name: 'Alternatives' })).toBeVisible()
  await expect(page.getByRole('link', { name: `Visit ${pick.name}` })).toHaveAttribute('href', `/go/${pick.slug}`)
})
