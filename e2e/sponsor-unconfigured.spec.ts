import { expect, test } from '@playwright/test'

// Runs on the founding-cap server, which has no STRIPE_PRICE_PLACEMENT_SUBSCRIPTION.
// Read-only: it never starts a checkout, so it cannot touch that server's founding count.
test('/sponsor hides the monthly subscription while its price is missing and keeps the other offers', async ({ page }) => {
  await page.goto('/sponsor')
  const offering = page.getByRole('group', { name: 'Offering' })
  await expect(offering.getByRole('radio', { name: /Featured placement, monthly subscription/ })).toHaveCount(0)
  await expect(page.getByText('Checkout for this slot is not configured yet.')).toHaveCount(0)
  await expect(offering.getByRole('radio', { name: /Featured placement for one week/ })).toBeEnabled()
  await expect(offering.getByRole('radio', { name: /Founding sponsor/ })).toHaveCount(1)
})
