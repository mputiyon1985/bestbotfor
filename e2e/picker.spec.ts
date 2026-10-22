import { expect, test } from '@playwright/test'
import { fewStrongOptionsLabel, overBudgetLabel, priceLabel } from '../src/lib/format'
import { recommend } from '../src/lib/recommend'
import { catalogFromSeeds } from '../src/test/catalog-from-seeds'

// Chat has six rated matches since unrated tools left the quiz; coding still fills seven.
const answers = { task: 'coding', budget: 'any', skill: 'beginner' } as const

test('three questions produce one pick and six alternatives', async ({ page }) => {
  const result = recommend(catalogFromSeeds(), answers)
  const pick = result?.picks[0]
  const alternatives = result?.picks.slice(1) ?? []
  expect(pick).toBeTruthy()
  expect(alternatives.length).toBeGreaterThanOrEqual(6)
  if (!pick) return

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The right AI in 30 seconds.')
  await page.getByLabel('Pick the closest job.').selectOption(answers.task)
  await page.getByRole('radio', { name: 'Any budget' }).check()
  await page.getByRole('radio', { name: 'Beginner' }).check()
  await page.getByRole('button', { name: 'See my best bot' }).click()
  await expect(page).toHaveURL(new RegExp(`/result\\?task=${answers.task}&budget=${answers.budget}&skill=${answers.skill}`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(pick.name)
  await expect(page.getByText(pick.reason)).toBeVisible()
  await expect(page.getByText(priceLabel(pick), { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: `Visit ${pick.name}` })).toHaveAttribute('href', `/go/${pick.slug}`)
  await expect(page.getByText(fewStrongOptionsLabel)).toHaveCount(0)

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
  const tight = { task: 'design', budget: 'free', skill: 'beginner' } as const
  const result = recommend(catalogFromSeeds(), tight)
  const alternatives = result?.picks.slice(1) ?? []
  const over = alternatives.filter((pick) => pick.budgetFit === 'over')
  expect(result?.picks.length).toBe(7)
  expect(result?.picks.every((pick) => pick.fitScore >= 50)).toBe(true)
  expect(over.length).toBeGreaterThan(0)
  expect(result?.picks.some((pick) => pick.slug === 'hyperwrite')).toBe(false)

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

test('a short list says few strong options exist', async ({ page }) => {
  const games = { task: 'games', budget: 'any', skill: 'beginner' } as const
  const result = recommend(catalogFromSeeds(), games)
  const alternatives = result?.picks.slice(1) ?? []
  expect(alternatives.length).toBeLessThan(6)
  expect(alternatives.length).toBeGreaterThan(0)

  await page.goto(`/result?task=${games.task}&budget=${games.budget}&skill=${games.skill}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(result?.picks[0]?.name ?? '')
  const list = page.getByRole('region', { name: 'Alternatives' })
  await expect(list.getByRole('listitem')).toHaveCount(alternatives.length)
  await expect(list.getByText(fewStrongOptionsLabel)).toBeVisible()
})

test('a low budget leaves unrated SOUNDRAW out of the music results', async ({ page }) => {
  const answers = { task: 'music', budget: 'low', skill: 'beginner' } as const
  const result = recommend(catalogFromSeeds(), answers)
  expect(result?.picks.length).toBeGreaterThan(0)
  expect(result?.picks.some((pick) => pick.slug === 'soundraw')).toBe(false)
  expect(result?.picks.every((pick) => pick.tool.editorial !== null)).toBe(true)
  expect(result?.picks.some((pick) => pick.slug === 'lalal-ai')).toBe(false)
  expect(result?.picks[0]?.reason).not.toContain('the music tool')

  await page.goto(`/result?task=${answers.task}&budget=${answers.budget}&skill=${answers.skill}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(result?.picks[0]?.name ?? '')
  await expect(page.getByRole('heading', { name: 'SOUNDRAW', exact: true })).toHaveCount(0)
})
