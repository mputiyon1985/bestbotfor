import { expect, test } from '@playwright/test'
import { editorialSeeds } from '../src/data/scores-pros-cons.seed'
import { ratingAriaLabel, starFills } from '../src/lib/editorial'

const claude = editorialSeeds.find((row) => row.slug === 'claude')
const chatgpt = editorialSeeds.find((row) => row.slug === 'chatgpt')

test('a scored tool shows fractional stars, the rubric, and no review schema', async ({ page }) => {
  expect(claude).toBeTruthy()
  if (!claude) return
  const label = ratingAriaLabel(claude.overall)
  expect(starFills(claude.overall)).toEqual([1, 1, 1, 1, 0.2])

  await page.goto('/tools/claude')
  const stars = page.getByRole('img', { name: label })
  await expect(stars).toBeVisible()
  await expect(stars.locator('svg').first()).toHaveAttribute('aria-hidden', 'true')
  const fills = await stars.locator('[data-star-fill]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-star-fill')))
  expect(fills).toEqual(starFills(claude.overall).map(String))

  await expect(page.getByRole('heading', { name: 'BestBotFor score' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'How we score' })).toBeVisible()
  await expect(page.getByText('not a user review')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pros and cons' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Source' })).toHaveCount(claude.pros.length + claude.cons.length)

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
  const combined = blocks.join('\n')
  expect(combined).not.toContain('AggregateRating')
  expect(combined).not.toContain('Review')
  expect(combined).not.toContain('ratingValue')
})

test('a tool with no verified editorial data hides the score and the pros', async ({ page }) => {
  await page.goto('/tools/gemini')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gemini')
  await expect(page.getByRole('heading', { name: 'BestBotFor score' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'How we score' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Pros and cons' })).toHaveCount(0)
  await expect(page.getByRole('img', { name: /Rated/ })).toHaveCount(0)
})

test('result cards show a compact pros list only for tools that have one', async ({ page }) => {
  expect(chatgpt).toBeTruthy()
  expect(claude).toBeTruthy()
  if (!chatgpt || !claude) return

  await page.goto('/result?task=chat&budget=any&skill=beginner')
  await expect(page.getByRole('img', { name: ratingAriaLabel(chatgpt.overall) })).toBeVisible()
  await expect(page.getByText(chatgpt.pros[0]?.text ?? '', { exact: false }).first()).toBeVisible()

  const claudeCard = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { level: 3, name: 'Claude', exact: true }),
  })
  await expect(claudeCard.getByRole('img', { name: ratingAriaLabel(claude.overall) })).toBeVisible()
  await expect(claudeCard.getByText('Pros:', { exact: false })).toBeVisible()
  await expect(claudeCard.getByText('Cons:', { exact: false })).toBeVisible()

  const geminiCard = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { level: 3, name: 'Gemini', exact: true }),
  })
  await expect(geminiCard).toBeVisible()
  await expect(geminiCard.getByText('Pros:', { exact: false })).toHaveCount(0)
  await expect(geminiCard.getByRole('img', { name: /Rated/ })).toHaveCount(0)
})
