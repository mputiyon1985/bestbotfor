import { expect, test } from '@playwright/test'

const WIDTHS = [375, 390, 768] as const

const PAGES = [
  { name: 'result', path: '/result?task=chat&budget=any&skill=beginner', pagination: false, bars: false },
  { name: 'all matches', path: '/result?task=chat&view=all', pagination: true, bars: false },
  { name: 'coding matches', path: '/result?task=coding&view=all', pagination: true, bars: false },
  { name: 'tool', path: '/tools/chatgpt', pagination: false, bars: true },
] as const

test('stars, bars, pros, and pagination fit at 375, 390, and 768', async ({ page }) => {
  await page.context().addCookies([
    { name: 'bbf_consent', value: 'denied', domain: '127.0.0.1', path: '/' },
  ])

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 })
    for (const target of PAGES) {
      await page.goto(target.path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByRole('img', { name: /^Rated / }).first()).toBeVisible()

      const fit = await page.evaluate(() => {
        const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
        const widgetOverflow = [
          ...document.querySelectorAll('[role="img"][aria-label^="Rated"]'),
          ...document.querySelectorAll('[data-criterion-row]'),
          ...document.querySelectorAll('[role="meter"]'),
          ...document.querySelectorAll('[data-pros-cons]'),
          ...document.querySelectorAll('nav[aria-label="Pages"]'),
        ]
          .filter((node): node is HTMLElement => node instanceof HTMLElement)
          .filter((node) => node.scrollWidth > node.clientWidth + 1)
          .map((node) => ({
            label: node.getAttribute('aria-label') || node.getAttribute('data-pros-cons') || node.tagName,
            scrollWidth: node.scrollWidth,
            clientWidth: node.clientWidth,
          }))

        const smallText: { size: number; text: string }[] = []
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        let current = walker.nextNode()
        while (current) {
          const text = current.textContent?.replace(/\s+/g, ' ').trim() ?? ''
          const parent = current.parentElement
          if (text && parent) {
            const style = getComputedStyle(parent)
            const hidden = style.display === 'none' || style.visibility === 'hidden' || Number.parseFloat(style.fontSize) === 0
            const box = parent.getBoundingClientRect()
            if (!hidden && (box.width > 0 || box.height > 0)) {
              const size = Number.parseFloat(style.fontSize)
              if (size < 12) smallText.push({ size, text: text.slice(0, 80) })
            }
          }
          current = walker.nextNode()
        }

        return {
          scrollWidth,
          innerWidth: window.innerWidth,
          widgetOverflow,
          smallText,
          bars: document.querySelectorAll('[role="meter"]').length,
          pros: document.querySelectorAll('[data-pros-cons]').length,
        }
      })

      expect(fit.scrollWidth, `${target.name} at ${width}px`).toBeLessThanOrEqual(fit.innerWidth)
      expect(fit.widgetOverflow, `${target.name} widgets at ${width}px`).toEqual([])
      expect(fit.smallText, `${target.name} text at ${width}px`).toEqual([])
      expect(fit.pros, `${target.name} pros at ${width}px`).toBeGreaterThan(0)
      if (target.bars) expect(fit.bars, `${target.name} bars at ${width}px`).toBe(4)

      const pagesNav = page.getByRole('navigation', { name: 'Pages' })
      if (target.pagination) {
        await expect(pagesNav).toBeVisible()
        const links = pagesNav.getByRole('link')
        const count = await links.count()
        expect(count, `${target.name} pagination at ${width}px`).toBeGreaterThan(1)
        for (let index = 0; index < count; index += 1) {
          const box = await links.nth(index).boundingBox()
          expect(box, `${target.name} link ${index} at ${width}px`).not.toBeNull()
          expect(box!.width, `${target.name} link ${index} width at ${width}px`).toBeGreaterThanOrEqual(44)
          expect(box!.height, `${target.name} link ${index} height at ${width}px`).toBeGreaterThanOrEqual(44)
        }
      }
    }
  }
})
