import { expect, test } from '@playwright/test'
import { taskSeeds, toolSeeds } from '../src/data/catalog'
import { bestGuideHeading } from '../src/lib/descriptions'
import { toolsForTask } from '../src/lib/recommend'
import { catalogFromSeeds } from '../src/test/catalog-from-seeds'

const catalog = catalogFromSeeds()

test.describe('seo hub pages', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: 'bbf_consent', value: 'denied', url: 'http://127.0.0.1:3000' }])
  })

  test('/best lists every job with its live top pick', async ({ page }) => {
    const response = await page.goto('/best')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle('Best AI Tools by Job · BestBotFor')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The best AI tool for every job')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/best$/)
    const jobs = page.getByRole('list', { name: 'Jobs' })
    await expect(jobs.getByRole('listitem')).toHaveCount(taskSeeds.length)
    for (const task of taskSeeds) {
      const top = toolsForTask(catalog, task.slug)[0]
      const link = jobs.getByRole('link', { name: bestGuideHeading(task.name), exact: true })
      await expect(link).toHaveAttribute('href', `/best/${task.slug}`)
      if (top) await expect(jobs.getByText(`: ${top.name}`, { exact: false }).first()).toBeVisible()
    }
  })

  test('/ai-loadout renders the picks from the catalog, the form and the PDF link', async ({ page, request }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto('/ai-loadout')
    await expect(page).toHaveTitle(`The AI Loadout: The Best AI Tool for All ${taskSeeds.length} Jobs · BestBotFor`)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', new RegExp(`catalog of ${toolSeeds.length} tools`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    const table = page.getByRole('table', { name: 'Top pick for each job' })
    await expect(table.getByRole('row')).toHaveCount(taskSeeds.length + 1)
    for (const task of taskSeeds) {
      const top = toolsForTask(catalog, task.slug)[0]
      if (!top) continue
      await expect(table.getByRole('link', { name: top.name, exact: true }).first()).toHaveAttribute('href', `/tools/${top.slug}`)
      await expect(table.getByRole('link', { name: bestGuideHeading(task.name), exact: true })).toHaveAttribute('href', `/best/${task.slug}`)
    }
    await expect(page.locator('input[name="source"][value="ai-loadout"]')).toHaveCount(1)
    const pdf = page.getByRole('link', { name: 'Download the AI Loadout (PDF)' })
    await expect(pdf).toHaveAttribute('href', '/ai-loadout.pdf')
    const file = await request.get('/ai-loadout.pdf')
    expect(file.status()).toBe(200)
    expect(file.headers()['content-type']).toContain('application/pdf')
    await expect(page.getByText('Sponsored', { exact: true })).toHaveCount(0)
  })

  test('the how-to-choose guide renders its outline, links and FAQ schema', async ({ page }) => {
    await page.goto('/guides/how-to-choose-an-ai-tool')
    await expect(page).toHaveTitle('How to Choose an AI Tool: 3 Questions That Decide It · BestBotFor')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('How to choose an AI tool')
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('How to choose an AI tool')
    const jobs = page.getByRole('list', { name: 'Jobs we cover' })
    await expect(jobs.getByRole('link')).toHaveCount(taskSeeds.length)
    await expect(page.getByRole('link', { name: 'Read how we rate tools' })).toHaveAttribute('href', '/how-we-rate')
    await expect(page.getByRole('link', { name: `Browse all ${toolSeeds.length} tools` })).toHaveAttribute('href', '/tools')
    await expect(page.getByRole('link', { name: 'Get your pick in 30 seconds' })).toHaveAttribute('href', '/')
    const schemas = await page.locator('script[type="application/ld+json"]').allTextContents()
    expect(schemas.some((text) => text.includes('"FAQPage"'))).toBe(true)
    expect(schemas.some((text) => text.includes('"BreadcrumbList"'))).toBe(true)
    await expect(page.locator('input[name="source"][value="guides"]')).toHaveCount(1)
  })

  test('unknown guides are a noindex 404', async ({ page }) => {
    const response = await page.goto('/guides/not-a-guide')
    expect(response?.status()).toBe(404)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })

  test('best guides and the sitemap link the new pages', async ({ page, request }) => {
    await page.goto('/best/coding')
    const more = page.getByRole('navigation', { name: 'More guides' })
    await expect(more.getByRole('link', { name: 'New to this? How to choose an AI tool' })).toHaveAttribute('href', '/guides/how-to-choose-an-ai-tool')
    await expect(more.getByRole('link', { name: 'Get the AI Loadout' })).toHaveAttribute('href', '/ai-loadout')
    await expect(more.getByRole('link', { name: 'Every job' })).toHaveAttribute('href', '/best')
    const body = await (await request.get('/sitemap.xml')).text()
    for (const route of ['/best', '/ai-loadout', '/guides/how-to-choose-an-ai-tool']) expect(body).toContain(`${route}</loc>`)
  })
})
