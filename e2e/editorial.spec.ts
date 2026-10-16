import { expect, test, type Page } from '@playwright/test'
import { editorialSeeds } from '../src/data/scores-pros-cons.seed'
import { UNRATED_SLUGS } from '../src/lib/editorial'
import { toolSeeds } from '../src/data/catalog'

const claude = editorialSeeds.find((row) => row.slug === 'claude')
const chatgpt = editorialSeeds.find((row) => row.slug === 'chatgpt')

const SCORE_PAGES = [
  '/tools/chatgpt',
  '/tools',
  '/best/chat',
  '/best/coding',
  '/compare/chatgpt-vs-claude',
  '/result?task=chat&budget=any&skill=beginner',
  '/result?task=chat&view=all',
] as const

async function expectNoScoreComponent(page: Page, path: string) {
  await expect(page.locator('[data-score-section]'), path).toHaveCount(0)
  await expect(page.locator('[data-star-rating]'), path).toHaveCount(0)
  await expect(page.locator('[data-criterion-row]'), path).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'BestBotFor score' }), path).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'How we score' }), path).toHaveCount(0)
  await expect(page.getByRole('img', { name: /Rated / }), path).toHaveCount(0)
  await expect(page.getByRole('meter'), path).toHaveCount(0)
  await expect(page.getByText(/\bout of 5\b/), path).toHaveCount(0)
}

test('/tools/chatgpt shows pros and cons and hides the score', async ({ page }) => {
  expect(chatgpt).toBeTruthy()
  if (!chatgpt) return

  await page.goto('/tools/chatgpt')
  const prosAndCons = page.getByRole('region', { name: 'Pros and cons' })
  await expect(prosAndCons).toBeVisible()
  await expect(prosAndCons.getByRole('heading', { name: 'Pros', exact: true })).toBeVisible()
  await expect(prosAndCons.getByRole('heading', { name: 'Cons', exact: true })).toBeVisible()
  await expect(prosAndCons.getByText(chatgpt.pros[0]?.text ?? '')).toBeVisible()
  await expect(prosAndCons.getByText(chatgpt.cons[0]?.text ?? '')).toBeVisible()
  await expectNoScoreComponent(page, '/tools/chatgpt')
  await expect(page.getByRole('link', { name: 'Source', exact: true })).toHaveCount(0)

  const description = (await page.locator('meta[name="description"]').getAttribute('content')) ?? ''
  const ogDescription = (await page.locator('meta[property="og:description"]').getAttribute('content')) ?? ''
  const ogTitle = (await page.locator('meta[property="og:title"]').getAttribute('content')) ?? ''
  for (const text of [description, ogDescription, ogTitle]) {
    expect(text).not.toMatch(/out of 5|BestBotFor score|How we score|Rated /)
  }

  const html = await page.content()
  expect(html).not.toContain('pcmag.com')
  expect(html).not.toContain('zdnet.com')
  expect(html).not.toContain('techradar.com')
  expect(html).not.toContain('chatgpt.com/pricing')
  expect(html).not.toContain('third_party')

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
  const combined = blocks.join('\n')
  expect(combined).not.toContain('AggregateRating')
  expect(combined).not.toContain('Review')
  expect(combined).not.toContain('ratingValue')
  expect(combined).not.toContain('out of 5')
  expect(combined).not.toContain('BestBotFor score')
})

test('no page renders the score component', async ({ page }) => {
  for (const path of SCORE_PAGES) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }), path).toBeVisible()
    await expectNoScoreComponent(page, path)
    const description = (await page.locator('meta[name="description"]').getAttribute('content')) ?? ''
    const ogDescription = (await page.locator('meta[property="og:description"]').getAttribute('content')) ?? ''
    expect(description, path).not.toMatch(/out of 5|BestBotFor score|How we score/)
    expect(ogDescription, path).not.toMatch(/out of 5|BestBotFor score|How we score/)
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
    const combined = blocks.join('\n')
    expect(combined, path).not.toContain('AggregateRating')
    expect(combined, path).not.toContain('ratingValue')
    expect(combined, path).not.toContain('out of 5')
  }
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
  await expect(page.getByText(chatgpt.pros[0]?.text ?? '', { exact: false }).first()).toBeVisible()
  await expectNoScoreComponent(page, '/result?task=chat&budget=any&skill=beginner')

  const claudeCard = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { level: 3, name: 'Claude', exact: true }),
  })
  await expect(claudeCard.getByText('Pros:', { exact: false })).toBeVisible()
  await expect(claudeCard.getByText('Cons:', { exact: false })).toBeVisible()
  await expect(claudeCard.locator('[data-star-rating]')).toHaveCount(0)

  const grokCard = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { level: 3, name: 'Grok', exact: true }),
  })
  await expect(grokCard).toBeVisible()
  await expect(grokCard.getByText('Pros:', { exact: false })).toHaveCount(0)
  await expect(grokCard.getByRole('img', { name: /Rated/ })).toHaveCount(0)
  await expect(grokCard.getByRole('link', { name: 'Source', exact: true })).toHaveCount(0)
})
