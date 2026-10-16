import { expect, test } from '@playwright/test'
import { toolSeeds } from '../src/data/catalog'
import { resolveToolLogo, TOOL_LOGO_SIZE } from '../src/lib/tool-logo'

const fileTool = toolSeeds.find((tool) => resolveToolLogo(tool.slug, tool.name).kind === 'file')
const fallbackTool = toolSeeds.find((tool) => resolveToolLogo(tool.slug, tool.name).kind === 'monogram')

const PAGES = [
  '/tools',
  '/tools/chatgpt',
  '/result?task=chat&budget=any&skill=beginner',
  '/result?task=chat&view=all',
  '/compare/chatgpt-vs-claude',
  '/search?q=chatgpt',
  fallbackTool ? `/search?q=${encodeURIComponent(fallbackTool.name)}` : '/search?q=chatgpt',
]

const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000'

function sameOriginImage(url: string): boolean {
  const parsed = new URL(url, origin)
  if (parsed.origin !== origin) return false
  const embedded = parsed.searchParams.get('url')
  if (embedded && /^https?:\/\//i.test(embedded)) return false
  return true
}

for (const width of [1280, 390]) {
  test(`tool logos are ${TOOL_LOGO_SIZE}px and stay on this host at ${width}px`, async ({ page }) => {
    const external: string[] = []
    page.on('request', (request) => {
      if (request.resourceType() !== 'image') return
      if (!sameOriginImage(request.url())) external.push(request.url())
    })

    await page.setViewportSize({ width, height: 900 })
    for (const path of PAGES) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const logos = page.getByRole('img', { name: / logo$/ })
      await expect(logos.first()).toBeVisible()
      const count = await logos.count()
      expect(count).toBeGreaterThan(0)
      for (let index = 0; index < count; index += 1) {
        const logo = logos.nth(index)
        const box = await logo.boundingBox()
        expect(box, `${path} logo ${index}`).not.toBeNull()
        if (!box) continue
        expect(box.width, `${path} logo ${index} width`).toBeGreaterThanOrEqual(TOOL_LOGO_SIZE - 1)
        expect(box.width, `${path} logo ${index} width`).toBeLessThanOrEqual(TOOL_LOGO_SIZE + 1)
        expect(box.height, `${path} logo ${index} height`).toBeGreaterThanOrEqual(TOOL_LOGO_SIZE - 1)
        expect(box.height, `${path} logo ${index} height`).toBeLessThanOrEqual(TOOL_LOGO_SIZE + 1)
      }
      const sources = await page.locator('img').evaluateAll((images) => images.map((image) => image.getAttribute('src') ?? ''))
      for (const src of sources) {
        expect(src.startsWith('http://'), src).toBe(false)
        expect(src.startsWith('https://'), src).toBe(false)
      }
      const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth)
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(1)
    }
    expect(external).toEqual([])
  })
}

test('a saved logo is an image and a missing logo is the monogram', async ({ page }) => {
  expect(fileTool).toBeTruthy()
  expect(fallbackTool).toBeTruthy()
  if (!fileTool || !fallbackTool) return

  const external: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() !== 'image') return
    if (!sameOriginImage(request.url())) external.push(request.url())
  })

  await page.goto(`/tools/${fileTool.slug}`)
  const fileLogo = page.getByRole('img', { name: `${fileTool.name} logo` })
  await expect(fileLogo).toBeVisible()
  await expect(fileLogo).toHaveJSProperty('tagName', 'IMG')
  const src = decodeURIComponent((await fileLogo.getAttribute('src')) ?? '')
  expect(src).toContain(`/logos/${fileTool.slug}.webp`)

  await page.goto(`/tools/${fallbackTool.slug}`)
  const fallback = resolveToolLogo(fallbackTool.slug, fallbackTool.name)
  expect(fallback.kind).toBe('monogram')
  const monogram = page.getByRole('img', { name: `${fallbackTool.name} logo` })
  await expect(monogram).toBeVisible()
  await expect(monogram).toHaveJSProperty('tagName', 'SPAN')
  if (fallback.kind === 'monogram') await expect(monogram).toHaveText(fallback.letter)
  expect(external).toEqual([])
})
