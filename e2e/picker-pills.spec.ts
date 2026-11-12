import { expect, test } from './fixtures'

function channel(value: number): number {
  const ratio = value / 255
  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4
}

function contrast(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const [red, green, blue] = color.match(/\d+/g)?.slice(0, 3).map(Number) ?? []
    return 0.2126 * channel(red ?? 0) + 0.7152 * channel(green ?? 0) + 0.0722 * channel(blue ?? 0)
  }
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

const desktop = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
] as const

const fold = [
  { width: 768, height: 800 },
  { width: 1023, height: 800 },
  { width: 1280, height: 800 },
] as const

test('budget and experience are radio rows that move with the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')

  const budget = page.getByRole('group', { name: '2. What can you spend?' })
  const skill = page.getByRole('group', { name: '3. How experienced are you?' })
  await expect(budget.getByRole('radio')).toHaveCount(3)
  await expect(skill.getByRole('radio')).toHaveCount(3)

  for (const group of [budget, skill]) {
    const boxes = await Promise.all([0, 1, 2].map(async (index) => group.getByRole('radio').nth(index).boundingBox()))
    const ys = boxes.map((box) => box?.y ?? 0)
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(4)
  }

  const anyBudget = budget.getByRole('radio', { name: 'Any budget' })
  await expect(anyBudget).toBeChecked()
  const snapshot = await budget.ariaSnapshot()
  expect(snapshot).toContain('radio')
  expect(snapshot).toContain('Any budget')
  expect(snapshot).toMatch(/checked/i)
  const anyLabel = budget.locator('label:has(input:checked)')
  await expect(anyLabel.locator('svg')).toBeVisible()
  const labelBox = await anyLabel.boundingBox()
  expect(labelBox?.height).toBeGreaterThanOrEqual(44)
  await expect(budget.locator('label:has(input[value="free"]) svg')).toBeHidden()

  await anyBudget.focus()
  const ring = await anyBudget.evaluate((el) => {
    const style = getComputedStyle(el)
    return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) }
  })
  expect(ring.outlineStyle).not.toBe('none')
  expect(ring.outlineWidth).toBeGreaterThanOrEqual(2)

  await page.keyboard.press('ArrowLeft')
  const lowCost = budget.getByRole('radio', { name: 'Low cost' })
  await expect(lowCost).toBeChecked()
  await expect(lowCost).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(anyBudget).toBeChecked()
  await page.keyboard.press('ArrowLeft')
  await expect(lowCost).toBeChecked()

  await page.keyboard.press('Tab')
  const beginner = skill.getByRole('radio', { name: 'Beginner' })
  await expect(beginner).toBeFocused()
  await page.keyboard.press('ArrowDown')
  const intermediate = skill.getByRole('radio', { name: 'Intermediate' })
  await expect(intermediate).toBeChecked()
  await expect(intermediate).toBeFocused()

  await page.getByLabel('Pick the closest job.').selectOption('chat')
  await page.getByRole('button', { name: 'See my best bot' }).click()
  await expect(page).toHaveURL(/\/result\?task=chat&budget=low&skill=intermediate$/)
})

test('the quiz card and the See my best bot button stay above an 800px fold', async ({ page }) => {
  for (const viewport of fold) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const form = page.locator('form[action="/result"]')
    const button = page.getByRole('button', { name: 'See my best bot' })
    const formBox = await form.boundingBox()
    const buttonBox = await button.boundingBox()
    expect(formBox, `${viewport.width} card`).not.toBeNull()
    expect(buttonBox, `${viewport.width} button`).not.toBeNull()
    if (!formBox || !buttonBox) return
    expect(formBox.y, `${viewport.width} card starts on screen`).toBeGreaterThanOrEqual(0)
    expect(formBox.y + formBox.height, `${viewport.width} card bottom`).toBeLessThanOrEqual(viewport.height)
    expect(buttonBox.y + buttonBox.height, `${viewport.width} button bottom`).toBeLessThanOrEqual(viewport.height)
  }
})

test('the quiz card, including the button, fits above the fold on desktop', async ({ page }) => {
  for (const viewport of desktop) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const form = page.locator('form[action="/result"]')
    const button = page.getByRole('button', { name: 'See my best bot' })
    const formBox = await form.boundingBox()
    const buttonBox = await button.boundingBox()
    expect(formBox, `${viewport.width}x${viewport.height} form`).not.toBeNull()
    expect(buttonBox, `${viewport.width}x${viewport.height} button`).not.toBeNull()
    expect(formBox!.y, `${viewport.width} card starts on screen`).toBeGreaterThanOrEqual(0)
    expect(formBox!.y + formBox!.height, `${viewport.width} card bottom`).toBeLessThanOrEqual(viewport.height)
    expect(buttonBox!.y + buttonBox!.height, `${viewport.width} button bottom`).toBeLessThanOrEqual(viewport.height)
    expect(formBox!.width, `${viewport.width} card width`).toBeLessThanOrEqual(640)
    expect(formBox!.width, `${viewport.width} card width`).toBeGreaterThanOrEqual(560)
    const mainBox = await page.locator('#main').boundingBox()
    expect(mainBox, `${viewport.width} main`).not.toBeNull()
    const centerDelta = Math.abs(formBox!.x + formBox!.width / 2 - (mainBox!.x + mainBox!.width / 2))
    expect(centerDelta, `${viewport.width} card centered`).toBeLessThanOrEqual(2)

    const skillBox = await page.getByRole('group', { name: '3. How experienced are you?' }).boundingBox()
    expect(skillBox, `${viewport.width} experience`).not.toBeNull()
    expect(buttonBox!.y - (skillBox!.y + skillBox!.height), `${viewport.width} space before button`).toBeGreaterThanOrEqual(16)
    expect(buttonBox!.height, `${viewport.width} button height`).toBeGreaterThanOrEqual(52)
    expect(buttonBox!.width, `${viewport.width} button fills the card`).toBeGreaterThanOrEqual(formBox!.width - 48)

    const paint = await button.evaluate((el) => {
      const style = getComputedStyle(el)
      return { weight: Number(style.fontWeight), color: style.color, background: style.backgroundColor }
    })
    expect(paint.weight, `${viewport.width} button weight`).toBeGreaterThanOrEqual(700)
    expect(contrast(paint.color, paint.background), `${viewport.width} button contrast`).toBeGreaterThanOrEqual(4.5)

    await button.focus()
    const ring = await button.evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        outlineOffset: Number.parseFloat(style.outlineOffset),
      }
    })
    expect(ring.outlineStyle, `${viewport.width} focus style`).not.toBe('none')
    expect(ring.outlineWidth, `${viewport.width} focus width`).toBeGreaterThanOrEqual(3)
    expect(ring.outlineOffset, `${viewport.width} focus offset`).toBeGreaterThanOrEqual(4)
  }
})

test('the quiz card is full width at 375px and the button stays easy to tap', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 })
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  const form = page.locator('form[action="/result"]')
  const button = page.getByRole('button', { name: 'See my best bot' })
  const formBox = await form.boundingBox()
  const buttonBox = await button.boundingBox()
  expect(formBox).not.toBeNull()
  expect(buttonBox).not.toBeNull()
  expect(formBox!.width).toBeGreaterThanOrEqual(375 - 40)
  expect(formBox!.x).toBeGreaterThanOrEqual(12)
  expect(formBox!.x + formBox!.width).toBeLessThanOrEqual(375 - 12)
  expect(buttonBox!.height).toBeGreaterThanOrEqual(44)
  expect(buttonBox!.width).toBeGreaterThanOrEqual(formBox!.width - 8)
  expect(buttonBox!.y).toBeGreaterThanOrEqual(0)
  expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(844)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test('pills stay inside the card at 390px and may wrap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const form = page.locator('form[action="/result"]')
  const formBox = await form.boundingBox()
  expect(formBox).not.toBeNull()
  const skill = page.getByRole('group', { name: '3. How experienced are you?' })
  const pills = skill.locator('label')
  await expect(skill.getByRole('radio')).toHaveCount(3)
  const count = await pills.count()
  expect(count).toBe(3)
  for (let index = 0; index < count; index += 1) {
    const box = await pills.nth(index).boundingBox()
    expect(box, `pill ${index}`).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.x).toBeGreaterThanOrEqual((formBox?.x ?? 0) - 1)
    expect(box!.x + box!.width).toBeLessThanOrEqual((formBox?.x ?? 0) + (formBox?.width ?? 0) + 1)
  }
})
