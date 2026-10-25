import { expect, test } from '@playwright/test'
import { editorialSeeds } from '../src/data/scores-pros-cons.seed'
import { keptProsConsSeeds, ratingSeeds, unratedSlugs } from '../src/data/scores-v23.seed'
import { ratingAriaLabel, starFills } from '../src/lib/editorial'
import { toolSeeds } from '../src/data/catalog'

const claude = ratingSeeds.find((row) => row.slug === 'claude')
const chatgpt = ratingSeeds.find((row) => row.slug === 'chatgpt')
const claudePoints = keptProsConsSeeds.find((row) => row.slug === 'claude')
const chatgptPoints = keptProsConsSeeds.find((row) => row.slug === 'chatgpt')

test('a scored tool shows fractional stars, the rubric, and no review schema', async ({ page }) => {
  expect(claude).toBeTruthy()
  expect(claudePoints).toBeTruthy()
  if (!claude || !claudePoints) return
  const label = ratingAriaLabel(claude.overall)
  expect(claude.overall).toBe(4)
  expect(starFills(claude.overall)).toEqual([1, 1, 1, 1, 0])

  await page.goto('/tools/claude')
  const stars = page.getByRole('img', { name: label })
  await expect(stars).toBeVisible()
  await expect(stars.locator('svg').first()).toHaveAttribute('aria-hidden', 'true')
  const fills = await stars.locator('[data-star-fill]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-star-fill')))
  expect(fills).toEqual(starFills(claude.overall).map(String))

  await expect(page.getByRole('heading', { name: 'Our rating', exact: true })).toBeVisible()
  // Ratings backlog batch 02: Kimi (3.9) joins Claude (4.0) in tie group chat-T3
  await expect(page.locator('[data-category-rank]')).toHaveText('Tied · #4 of 5 in Chat')
  await expect(page.locator('[data-tie]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'How we score' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /out of 5/ })).toHaveAttribute('href', '/how-we-rate')
  const prosAndCons = page.getByRole('region', { name: 'Pros and cons' })
  await expect(prosAndCons).toBeVisible()
  await expect(prosAndCons.getByText(claudePoints.pros[0]?.text ?? '')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Source', exact: true })).toHaveCount(0)
  for (const label of ['Quality', 'Features', 'Value', 'Ease']) {
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
  expect(html).not.toContain('evidence.jsonl')
  expect(html).not.toContain('source_urls')

  const description = (await page.locator('meta[name="description"]').getAttribute('content')) ?? ''
  const ogDescription = (await page.locator('meta[property="og:description"]').getAttribute('content')) ?? ''
  expect(description).not.toMatch(/out of 5|(?<![A-Za-z])Our rating\b|How we score|Rated /)
  expect(ogDescription).not.toMatch(/out of 5|(?<![A-Za-z])Our rating\b|How we score|Rated /)

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
  const combined = blocks.join('\n')
  expect(combined).not.toContain('AggregateRating')
  expect(combined).not.toContain('Review')
  expect(combined).not.toContain('ratingValue')
  expect(combined).not.toContain('out of 5')
})

test('unrated tools hide the score and keep pros and cons', async ({ page }) => {
  test.setTimeout(180_000)
  expect(unratedSlugs).toHaveLength(132)
  const unlisted = new Set(toolSeeds.filter((item) => item.unlisted).map((item) => item.slug))
  for (const slug of unratedSlugs.filter((item) => !unlisted.has(item))) {
    const tool = toolSeeds.find((item) => item.slug === slug)
    const v1 = editorialSeeds.find((row) => row.slug === slug)
    await page.goto(`/tools/${slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(tool?.name ?? slug)
    await expect(page.getByRole('heading', { name: 'Our rating', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'How we score' })).toHaveCount(0)
    await expect(page.locator('[data-category-rank]')).toHaveCount(0)
    await expect(page.locator('[data-score-note]')).toHaveCount(0)
    await expect(page.locator('[data-score-section]')).toHaveCount(0)
    const prosAndCons = page.getByRole('region', { name: 'Pros and cons' })
    if (v1) {
      await expect(prosAndCons.getByRole('heading', { name: 'Pros and cons' })).toBeVisible()
      await expect(prosAndCons.getByText(v1.pros[0]?.text ?? '', { exact: true })).toBeVisible()
      await expect(prosAndCons.getByText(v1.cons[0]?.text ?? '', { exact: true })).toBeVisible()
    } else {
      await expect(prosAndCons).toHaveCount(0)
    }
    await expect(page.getByRole('img', { name: /Rated/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Source', exact: true })).toHaveCount(0)
    const html = await page.content()
    expect(html).not.toContain('pcmag.com')
    expect(html).not.toContain('third_party')
    expect(html).not.toContain('evidence.jsonl')
    expect(html).not.toContain('source_urls')
  }
})

test('result cards show a compact pros list only for tools that have one', async ({ page }) => {
  expect(chatgpt).toBeTruthy()
  expect(chatgptPoints).toBeTruthy()
  expect(claude).toBeTruthy()
  if (!chatgpt || !chatgptPoints || !claude) return

  await page.goto('/result?task=chat&budget=any&skill=beginner')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ChatGPT')
  await expect(page.getByRole('img', { name: ratingAriaLabel(chatgpt.overall) }).first()).toBeVisible()
  await expect(page.getByText('#1 of 5 in Chat').first()).toBeVisible()
  await expect(page.getByText(chatgptPoints.pros[0]?.text ?? '', { exact: false }).first()).toBeVisible()

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
  await expect(grokCard.getByText('Tied', { exact: false })).toBeVisible()
  await expect(grokCard.getByText('Pros:', { exact: false })).toHaveCount(0)
  await expect(grokCard.getByRole('img', { name: /Rated/ })).toBeVisible()
  await expect(grokCard.getByRole('link', { name: 'Source', exact: true })).toHaveCount(0)

  const perplexityCard = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { level: 3, name: 'Perplexity', exact: true }),
  })
  await expect(perplexityCard).toBeVisible()
  // rated 3.9 in the 2026-10-22 quiz-pick batch
  await expect(perplexityCard.getByText('Pros:', { exact: false })).toBeVisible()
  await expect(perplexityCard.getByRole('img', { name: ratingAriaLabel(3.9) })).toBeVisible()
})

test('windsurf stays at its slug, cursor and relevance show the reviewed prices, and source columns stay off the page', async ({ page }) => {
  const windsurfResponse = await page.goto('/tools/windsurf')
  expect(windsurfResponse?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Devin Desktop (formerly Windsurf)')
  await expect(page.getByText('Cognition', { exact: true })).toBeVisible()
  await expect(page.getByText('Free tier, then $20 and up')).toBeVisible()
  await expect(page.getByText('The Free plan is $0 and Pro is $20 a month.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Our rating', exact: true })).toBeVisible()
  await expect(page.locator('[data-category-rank]')).toHaveText('Tied · #11 of 13 in Coding')
  await expect(page.locator('[data-tie]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pros and cons' })).toBeVisible()
  await expect(page.getByText('Free plan has unlimited Tab completions and inline edits', { exact: true })).toBeVisible()
  const comparison = page.getByRole('link', { name: 'Devin Desktop (formerly Windsurf) vs Cursor' })
  await expect(comparison).toHaveAttribute('href', '/compare/cursor-vs-windsurf')
  let html = await page.content()
  expect(html).not.toContain('zapier.com')
  expect(html).not.toContain('techradar.com')
  expect(html).not.toContain('pcmag.com')
  expect(html).not.toContain('https://devin.ai/pricing')
  expect(html).not.toContain('docs.devin.ai')
  expect(html).not.toContain('third_party')
  expect(html).not.toContain('evidence.jsonl')
  expect(html).not.toContain('source_urls')
  expect(html).not.toContain('windsurf.com')

  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Cursor vs Devin Desktop (formerly Windsurf)' })).toHaveAttribute(
    'href',
    '/compare/cursor-vs-windsurf',
  )

  const compare = await page.goto('/compare/cursor-vs-windsurf')
  expect(compare?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cursor vs Devin Desktop (formerly Windsurf)')
  await expect(page.getByRole('link', { name: 'Devin Desktop (formerly Windsurf) profile' })).toHaveAttribute('href', '/tools/windsurf')

  await page.goto('/tools/cursor')
  await expect(page.getByRole('heading', { name: 'Our rating', exact: true })).toBeVisible()
  await expect(page.locator('[data-category-rank]')).toContainText('#2 of 13 in Coding')
  await expect(page.getByRole('heading', { name: 'Pros and cons' })).toBeVisible()
  await expect(page.getByText('Free plan includes limited agent requests', { exact: true })).toBeVisible()
  await expect(page.getByText('Free tier, then $8 and up')).toBeVisible()
  await expect(page.getByText('Plus $8 (Grok models only)')).toBeVisible()
  await expect(page.getByText('Premium $30 (third-party models billed extra)')).toBeVisible()
  await expect(page.getByText('Pro $20 is for legacy subscribers only.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Cursor vs Devin Desktop (formerly Windsurf)' })).toHaveAttribute(
    'href',
    '/compare/cursor-vs-windsurf',
  )
  html = await page.content()
  expect(html).not.toContain('techradar.com')
  expect(html).not.toContain('zapier.com')
  expect(html).not.toContain('third_party')
  expect(html).not.toContain('evidence.jsonl')
  expect(html).not.toContain('source_urls')
  expect(html).not.toContain('cursor.com/pricing')

  await page.setViewportSize({ width: 375, height: 844 })
  await page.goto('/tools/windsurf')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Devin Desktop (formerly Windsurf)')
  const windsurfFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(windsurfFits).toBe(true)
  await page.goto('/compare/cursor-vs-windsurf')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cursor vs Devin Desktop (formerly Windsurf)')
  const compareFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(compareFits).toBe(true)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/tools/relevance-ai')
  await expect(page.getByText('$19 and up')).toBeVisible()
  await expect(page.getByText('No', { exact: true })).toBeVisible()
  await expect(page.getByText('The free plan is retired. Pro is $19 a month billed yearly.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Our rating', exact: true })).toHaveCount(0)
  await expect(page.locator('[data-score-section]')).toHaveCount(0)
  await expect(page.locator('[data-category-rank]')).toHaveCount(0)
  const relevancePoints = editorialSeeds.find((row) => row.slug === 'relevance-ai')
  expect(relevancePoints?.pros[0]?.text).toBeTruthy()
  expect(relevancePoints?.cons[0]?.text).toBeTruthy()
  const relevancePros = page.getByRole('region', { name: 'Pros and cons' })
  await expect(relevancePros.getByRole('heading', { name: 'Pros and cons' })).toBeVisible()
  await expect(relevancePros.getByText(relevancePoints?.pros[0]?.text ?? '', { exact: true })).toBeVisible()
  await expect(relevancePros.getByText(relevancePoints?.cons[0]?.text ?? '', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Source', exact: true })).toHaveCount(0)
  html = await page.content()
  expect(html).not.toContain('relevanceai.com/docs')
  expect(html).not.toContain('third_party')
  expect(html).not.toContain('evidence.jsonl')
  expect(html).not.toContain('source_urls')
})

test('the how we rate page uses the public copy and no source columns', async ({ page }) => {
  const response = await page.goto('/how-we-rate')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How we rate AI tools')
  await expect(page.getByText('Quality (40%)')).toBeVisible()
  await expect(page.getByText('tools within 0.1 of each other are shown as tied', { exact: false })).toBeVisible()
  await expect(
    page.getByText('We keep the evidence and sources for each score on file and review them quarterly.'),
  ).toBeVisible()
  const html = await page.content()
  expect(html).not.toContain('Every score links to its sources')
  expect(html).not.toContain('links to its sources')
  expect(html).not.toContain('pcmag.com')
  expect(html).not.toContain('evidence.jsonl')
  expect(html).not.toContain('source_urls')
  expect(html).not.toContain('AggregateRating')
})

test('a single-tool category hides the rank and a note shows when it is filled', async ({ page }) => {
  await page.goto('/tools/craft')
  await expect(page.getByRole('heading', { name: 'Our rating', exact: true })).toBeVisible()
  await expect(page.locator('[data-category-rank]')).toHaveCount(0)
  await expect(page.locator('[data-tie]')).toHaveCount(0)
  let html = await page.content()
  expect(html).not.toContain('#1 of 1')
  expect(html).not.toContain('evidence.jsonl')
  expect(html).not.toContain('www.craft.do/pricing')

  await page.goto('/tools/chatgpt')
  await expect(page.locator('[data-category-rank]')).toHaveText('#1 of 5 in Chat')
  await expect(page.locator('[data-score-note]')).toHaveText('regular price not published; value neutral')
  html = await page.content()
  expect(html).not.toContain('pcmag.com')
  expect(html).not.toContain('evidence.jsonl')
  expect(html).not.toContain('chatgpt.com/pricing')
})

test('unlisted tools have no page, no /go redirect and no sitemap entry', async ({ page, request }) => {
  const tool = await page.goto('/tools/mercury-inception')
  expect(tool?.status()).toBe(404)
  const go = await request.get('/go/mercury-inception', { maxRedirects: 0 })
  expect(go.status()).toBe(404)
  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.status()).toBe(200)
  const xml = await sitemap.text()
  expect(xml).toContain('/tools/twinmind')
  expect(xml).not.toContain('mercury-inception')
})

test('archived tools stay live, show the notice, and stay off quiz results', async ({ page }) => {
  const flowise = await page.goto('/tools/flowise')
  expect(flowise?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Flowise')
  await expect(page.locator('[data-maintenance-notice]')).toHaveText('Unmaintained (repo archived)')
  await expect(page.locator('[data-category-rank]')).toHaveText('Tied · #6 of 8 in Agents')
  await expect(page.locator('[data-tie]')).toBeVisible()

  const roo = await page.goto('/tools/roo-code')
  expect(roo?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Roo Code')
  await expect(page.locator('[data-maintenance-notice]')).toHaveText('Unmaintained (repo archived)')
  await expect(page.locator('[data-category-rank]')).toHaveText('#13 of 13 in Coding')
  await expect(page.locator('[data-tie]')).toHaveCount(0)

  await page.goto('/result?task=agents&budget=any&skill=intermediate')
  await expect(page.getByRole('heading', { name: 'Flowise', exact: true })).toHaveCount(0)
  await page.goto('/result?task=coding&budget=any&skill=intermediate')
  await expect(page.getByRole('heading', { name: 'Roo Code', exact: true })).toHaveCount(0)
})
