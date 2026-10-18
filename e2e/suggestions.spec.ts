import { expect, test } from '@playwright/test'

test('the footer and the bottom of a page open the suggestion form', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('contentinfo').getByRole('link', { name: 'Suggest something' }).click()
  const dialog = page.getByRole('dialog', { name: 'Suggest something' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Type').selectOption('add')
  await dialog.getByLabel('Message').fill('Please add a writing comparison.')
  await dialog.getByLabel('Email').fill('reader@example.com')
  await dialog.getByRole('button', { name: 'Send suggestion' }).click()
  await expect(dialog.getByRole('status')).toHaveText('Thanks. We read every note.')

  await page.goto('/about')
  await page.getByRole('main').getByRole('link', { name: 'Suggest something' }).click()
  await expect(page.getByRole('dialog', { name: 'Suggest something' })).toBeVisible()
})

test('a filled honeypot still looks successful', async ({ page }) => {
  await page.goto('/privacy')
  await page.getByRole('main').getByRole('link', { name: 'Suggest something' }).click()
  const dialog = page.getByRole('dialog', { name: 'Suggest something' })
  await dialog.getByLabel('Message').fill('Ignore this')
  await dialog.locator('input[name="suggestion_website"]').fill('https://spam.example')
  await dialog.getByRole('button', { name: 'Send suggestion' }).click()
  await expect(dialog.getByRole('status')).toHaveText('Thanks. We read every note.')
  await expect(page.getByText('If you suggest something, we store the feedback')).toBeVisible()
})

test('an empty message is rejected', async ({ page }) => {
  await page.goto('/terms')
  await page.getByRole('contentinfo').getByRole('link', { name: 'Suggest something' }).click()
  const dialog = page.getByRole('dialog', { name: 'Suggest something' })
  await dialog.getByLabel('Message').fill('   ')
  await dialog.getByRole('button', { name: 'Send suggestion' }).click()
  await expect(dialog.getByRole('status')).toHaveText('Enter a message.')
})
