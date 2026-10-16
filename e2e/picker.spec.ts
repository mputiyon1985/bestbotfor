import { expect, test } from '@playwright/test'
import { overBudgetLabel, priceLabel } from '../src/lib/format'
import { recommend } from '../src/lib/recommend'
import { catalogFromSeeds } from '../src/test/catalog-from-seeds'

const answers = { task: 'chat', budget: 'any', skill: 'beginner' } as const

test('three questions produce one pick and five alternatives', async ({ page }) => {
  const result = recommend(catalogFromSeeds(), answers)
  const pick = result?.picks[0]
  const alternatives = result?.picks.slice(1) ?? []
  expect(pick).toBeTruthy()
  expect(alternatives.length).toBeGreaterThanOrEqual(5)
  if (!pick) return

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three questions. One best bot.')
  await page.getByLabel('Pick the closest job.').selectOption(answers.task)
  await page.getByRole('radio', { name: 'Any budget' }).check()
  await page.getByRole('radio', { name: 'Beginner' }).check()
  await page.getByRole('button', { name: 'See my best bot' }).click()
  await expect(page).toHaveURL(new RegExp(`/result\\?task=${answers.task}&budget=${answers.budget}&skill=${answers.skill}`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(pick.name)
  await expect(page.getByText(pick.reason)).toBeVisible()
  await expect(page.getByText(priceLabel(pick), { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: `Visit ${pick.name}` })).toHaveAttribute('href', `/go/${pick.slug}`)

  const list = page.getByRole('region', { name: 'Alternatives' }).getByRole('list')
  await expect(list.getByRole('listitem')).toHaveCount(alternatives.length)
  for (const alternative of alternatives) {
    const item = list.getByRole('listitem').filter({
      has: page.getByRole('heading', { level: 3, name: alternative.name, exact: true }),
    })
    await expect(item.getByText(alternative.reason)).toBeVisible()
    await expect(item.getByText(priceLabel(alternative), { exact: true })).toBeVisible()
  }
})

test('a free budget labels the best fits that sit just over budget', async ({ page }) => {
  const tight = { task: 'seo', budget: 'free', skill: 'beginner' } as const
  const result = recommend(catalogFromSeeds(), tight)
  const alternatives = result?.picks.slice(1) ?? []
  const over = alternatives.filter((pick) => pick.budgetFit === 'over')
  expect(result?.picks.length).toBeGreaterThanOrEqual(6)
  expect(over.length).toBeGreaterThan(0)

  await page.goto(`/result?task=${tight.task}&budget=${tight.budget}&skill=${tight.skill}`)
  const list = page.getByRole('region', { name: 'Alternatives' })
  await expect(list.getByRole('listitem')).toHaveCount(alternatives.length)
  for (const alternative of over) {
    const item = list.getByRole('listitem').filter({
      has: page.getByRole('heading', { level: 3, name: alternative.name, exact: true }),
    })
    await expect(item.getByText(overBudgetLabel)).toBeVisible()
    await expect(item.getByText(alternative.reason)).toBeVisible()
    await expect(item.getByText(priceLabel(alternative), { exact: true })).toBeVisible()
  }
  const within = alternatives.filter((pick) => pick.budgetFit === 'within')
  for (const alternative of within) {
    const item = list.getByRole('listitem').filter({
      has: page.getByRole('heading', { level: 3, name: alternative.name, exact: true }),
    })
    await expect(item.getByText(overBudgetLabel)).toHaveCount(0)
  }
})
