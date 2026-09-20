import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  const dashboardUrl = process.env.DASHBOARD_URL?.trim();
  const email = process.env.TEST_USER_EMAIL?.trim();
  const password = process.env.TEST_USER_PASSWORD?.trim();

  if (!dashboardUrl || !email || !password) {
    throw new Error(
      'Missing DASHBOARD_URL, TEST_USER_EMAIL, or TEST_USER_PASSWORD in environment',
    );
  }

  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto(dashboardUrl);

  const emailField = page
    .locator('.input_wrapper')
    .filter({ hasText: /البريد الإلكتروني|email/i })
    .locator('input')
    .first();
  const passwordField = page.locator('input[type="password"]').first();

  await expect(emailField).toBeVisible({ timeout: 30000 });

  // Password uses readonly until focus (anti-autofill)
  await emailField.click();
  await emailField.fill(email);
  await passwordField.click();
  await passwordField.evaluate((el) => el.removeAttribute('readonly'));
  await passwordField.fill(password);

  await page.getByRole('button', { name: /تسجيل دخول|log\s*in|sign\s*in/i }).click();

  // Reliable post-login signal
  await expect(page.getByRole('heading', { name: /مرحبا/ })).toBeVisible({ timeout: 45000 });
  await expect(page.locator('a[href*="/dashboard/coupons"]')).toBeVisible();

  await page.context().storageState({ path: authFile });
});
