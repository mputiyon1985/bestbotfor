import { expect, test } from '@playwright/test'

const desktop = [
  { width: 1440, height: 900 },
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
  }
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
