import { expect, test } from '@playwright/test'

test('three questions produce one pick and alternatives', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three questions. One best bot.')
  await page.getByLabel('Pick the closest job.').selectOption('chat')
  await page.getByRole('radio', { name: 'Any budget' }).check()
  await page.getByRole('radio', { name: 'Beginner' }).check()
  await page.getByRole('button', { name: 'See my best bot' }).click()
  await expect(page).toHaveURL(/\/result\?task=chat&budget=any&skill=beginner/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ChatGPT')
  await expect(page.getByRole('heading', { name: 'Alternatives' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Visit ChatGPT' })).toHaveAttribute('href', '/go/chatgpt')
})
