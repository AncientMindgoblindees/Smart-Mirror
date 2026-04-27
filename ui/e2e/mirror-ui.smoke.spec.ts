import { expect, test } from '@playwright/test';


test('mirror UI loads without crashing', async ({ page }) => {
  await page.goto('/ui/');

  await expect(page.getByText(/no companion connected/i)).toBeVisible();
});

