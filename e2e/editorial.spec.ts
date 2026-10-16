import { expect, test } from '@playwright/test'
import { editorialSeeds } from '../src/data/scores-pros-cons.seed'
import { ratingAriaLabel, starFills, UNRATED_SLUGS } from '../src/lib/editorial'
import { toolSeeds } from '../src/data/catalog'

const claude = editorialSeeds.find((row) => row.slug === 'claude')
const chatgpt = editorialSeeds.find((row) => row.slug === 'chatgpt')

test('a scored tool shows fractional stars, the rubric, and no review schema', async ({ page }) => {
  expect(claude).toBeTruthy()
  if (!claude) return
  const label = ratingAriaLabel(claude.overall)
  expect(claude.overall).toBe(4.5)
  expect(starFills(claude.overall)).toEqual([1, 1, 1, 1, 0.5])

  await page.goto('/tools/claude')
  const stars = page.getByRole('img', { name: label })
  await expect(stars).toBeVisible()
  await expect(stars.locator('svg').first()).toHaveAttribute('aria-hidden', 'true')
  const fills = await stars.locator('[data-star-fill]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-star-fill')))
  expect(fills).toEqual(starFills(claude.overall).map(String))

  await expect(page.getByRole('heading', { name: 'BestBotFor score' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'How we score' })).toBeVisible()
  await expect(page.getByText('not a user review')).toBeVisible()
  const prosAndCons = page.getByRole('region', { name: 'Pros and cons' })
  await expect(prosAndCons).toBeVisible()
  await expect(prosAndCons.getByText(claude.pros[0]?.text ?? '')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Source', exact: true })).toHaveCount(0)
  for (const label of ['Features', 'Value', 'Ease', 'Quality']) {
    const meter = page.getByRole('meter', { name: new RegExp(`^${label} `) })
    await expect(meter).toBeVisible()
    await expect(meter).toHaveAttribute('aria-valuemax', '5')
  }
  const html = await page.content()
  expect(html).not.toContain('pcmag.com')
  expect(html).not.toContain('zdnet.com')
  expect(html).not.toContain('techradar.com')
  expect(html).not.toContain('claude.com/pricing')
  expect(html).not.toContain('third_party')

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
  const combined = blocks.join('\n')
  expect(combined).not.toContain('AggregateRating')
  expect(combined).not.toContain('Review')
  expect(combined).not.toContain('ratingValue')
})

test('blank tools hide the score and the pros, and windsurf keeps its name', async ({ page }) => {
  for (const slug of UNRATED_SLUGS) {
    const tool = toolSeeds.find((item) => item.slug === slug)
    await page.goto(`/tools/${slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(tool?.name ?? slug)
    await expect(page.getByRole('heading', { name: 'BestBotFor score' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'How we score' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Pros and cons' })).toHaveCount(0)
    await expect(page.getByRole('img', { name: /Rated/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Source', exact: true })).toHaveCount(0)
    const html = await page.content()
    expect(html).not.toContain('pcmag.com')
    expect(html).not.toContain('third_party')
  }
})

test('result cards show a compact pros list only for tools that have one', async ({ page }) => {
  expect(chatgpt).toBeTruthy()
  expect(claude).toBeTruthy()
  if (!chatgpt || !claude) return

  await page.goto('/result?task=chat&budget=any&skill=beginner')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ChatGPT')
  await expect(page.getByRole('img', { name: ratingAriaLabel(chatgpt.overall) }).first()).toBeVisible()
  await expect(page.getByText(chatgpt.pros[0]?.text ?? '', { exact: false }).first()).toBeVisible()

  const claudeCard = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { level: 3, name: 'Claude', exact: true }),
  })
  await expect(claudeCard.getByRole('img', { name: ratingAriaLabel(claude.overall) })).toBeVisible()
  await expect(claudeCard.getByText('Pros:', { exact: false })).toBeVisible()
  await expect(claudeCard.getByText('Cons:', { exact: false })).toBeVisible()

  const grokCard = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { level: 3, name: 'Grok', exact: true }),
  })
  await expect(grokCard).toBeVisible()
  await expect(grokCard.getByText('Pros:', { exact: false })).toHaveCount(0)
  await expect(grokCard.getByRole('img', { name: /Rated/ })).toHaveCount(0)
  await expect(grokCard.getByRole('link', { name: 'Source', exact: true })).toHaveCount(0)
})
