import { expect, test } from '@playwright/test'

test('a visitor can sign up for the newsletter', async ({ page }) => {
  await page.goto('/newsletter')
  await page.getByLabel('Email address').fill('reader@example.com')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByRole('status')).toHaveText("Thanks. You're on the list.")
})

test('a filled honeypot still looks like a successful signup', async ({ page }) => {
  await page.goto('/newsletter')
  await page.getByLabel('Email address').fill('bot@example.com')
  await page.locator('#company_website').fill('https://spam.example')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByRole('status')).toHaveText("Thanks. You're on the list.")
})

test('an invalid email is rejected', async ({ page }) => {
  await page.goto('/newsletter')
  await page.getByLabel('Email address').fill('not-an-email')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByRole('status')).toHaveText('Enter a valid email address.')
})
