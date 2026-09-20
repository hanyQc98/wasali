import { test, expect, type Page, type Locator } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const COUPONS_LIST = '/dashboard/coupons/all';
const COUPONS_CREATE = '/dashboard/coupons/create';
const SCREENSHOT_DIR = path.join(__dirname, '../test-results/screenshots');

type CouponData = {
  nameAr: string;
  nameEn: string;
  code: string;
  discount: string;
  uses: string;
  endDay: number;
};

function uniqueCoupon(): CouponData {
  const stamp = Date.now().toString().slice(-6);
  // Pick an end day later in the month (avoid overflow near month end)
  const today = new Date();
  const endDay = Math.min(today.getDate() + 10, 28);

  return {
    nameAr: `كوبون اختبار ${stamp}`,
    nameEn: `Test Coupon ${stamp}`,
    code: `PW${stamp}`,
    discount: '12',
    uses: '5',
    endDay,
  };
}

async function fieldByLabel(page: Page, label: RegExp | string): Promise<Locator> {
  return page.locator('.input_wrapper').filter({ hasText: label }).locator('input.form-control, input[type="number"], .ant-calendar-picker-input').first();
}

async function selectMultiselectOption(page: Page, labelText: string | RegExp, optionText: string | RegExp) {
  const wrapper = page.locator('.select_wrapper, .input_wrapper').filter({ hasText: labelText }).first();
  await wrapper.locator('.multiselect').click();
  await page.locator('.multiselect__content-wrapper:visible .multiselect__option')
    .filter({ hasText: optionText })
    .first()
    .click();
}

async function setAntDateToday(page: Page, label: RegExp | string) {
  const wrapper = page.locator('.input_wrapper').filter({ hasText: label }).first();
  await wrapper.locator('[aria-label="icon: calendar"], .anticon-calendar').first().click();
  await page.getByRole('button', { name: /^Today$/i }).click();
}

async function setAntDateDay(page: Page, label: RegExp | string, day: number) {
  const wrapper = page.locator('.input_wrapper').filter({ hasText: label }).first();
  await wrapper.locator('[aria-label="icon: calendar"], .anticon-calendar').first().click();
  // Prefer current-month enabled cells
  const cell = page
    .locator('.ant-calendar:visible td.ant-calendar-cell:not(.ant-calendar-last-month-cell):not(.ant-calendar-next-month-btn-day):not(.ant-calendar-disabled-cell)')
    .filter({ hasText: new RegExp(`^${day}$`) })
    .first();
  if (await cell.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cell.click();
  } else {
    await page.getByRole('gridcell', { name: String(day), exact: true }).last().click();
  }
}

async function fillCouponForm(page: Page, data: CouponData) {
  await (await fieldByLabel(page, /الاسم بالعربية/)).fill(data.nameAr);
  await (await fieldByLabel(page, /الاسم بالإنجليزية/)).fill(data.nameEn);
  await page
    .locator('.input_wrapper')
    .filter({ hasText: /الكود/ })
    .locator('input.form-control')
    .first()
    .fill(data.code);

  await selectMultiselectOption(page, /نوع الخصم/, /نسبة الخصم/);
  await page
    .locator('.input_wrapper')
    .filter({ hasText: /قيمة الخصم|نسبة الخصم \(%\)/ })
    .locator('input[type="number"]')
    .first()
    .fill(data.discount);

  await selectMultiselectOption(page, /عدد الاستخدامات/, /عدد مرات الاستخدام/);
  // The usage-count number field appears after selecting "عدد مرات الاستخدام"
  await page
    .locator('.input_wrapper')
    .filter({ hasText: /عدد مرات الاستخدام/ })
    .filter({ has: page.locator('input[type="number"]') })
    .locator('input[type="number"]')
    .fill(data.uses);

  await setAntDateToday(page, /تاريخ البدء/);
  await setAntDateDay(page, /تاريخ النهاية/, data.endDay);
}

async function confirmDeleteIfPrompted(page: Page) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  // Button label is "حسنًا" (diacritics vary) — match by stem, not Cancel
  await dialog.getByRole('button', { name: /حسن/ }).click();
}

async function captureFailureScreenshot(page: Page, name: string) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  try {
    if (!page.isClosed()) {
      await page.screenshot({ path: filePath, fullPage: true });
    }
  } catch {
    // Page may already be closed after timeout
  }
  return filePath;
}

test.describe.serial('Coupons CRUD', () => {
  let coupon: CouponData;
  let couponId: string;
  let updatedNameAr: string;

  test.beforeAll(() => {
    coupon = uniqueCoupon();
    updatedNameAr = `${coupon.nameAr} محدث`;
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test('negative: empty required fields shows validation', async ({ page }) => {
    try {
      await page.goto(COUPONS_CREATE);
      await expect(page.getByRole('heading', { name: /إضافة كوبون جديد/ })).toBeVisible();

      const responsePromise = page.waitForResponse(
        (res) =>
          res.url().includes('/coupons') &&
          res.request().method() === 'POST' &&
          [422, 400].includes(res.status()),
        { timeout: 15000 },
      ).catch(() => null);

      await page.getByRole('button', { name: 'حفظ' }).click();

      const response = await responsePromise;
      // Stay on create page
      await expect(page).toHaveURL(/\/coupons\/create/);

      // UI toast / message OR API validation (422)
      const toast = page.locator('.Toastify__toast, .Vue-Toastification__toast, .swal2-popup, [role="alert"], .toast');
      const hasToast = await toast.filter({ hasText: /مطلوب|required/i }).first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      const apiInvalid = response !== null && [422, 400].includes(response.status());
      expect(
        hasToast || apiInvalid,
        'Expected validation toast containing مطلوب, or HTTP 422/400 from create API',
      ).toBeTruthy();
    } catch (error) {
      await captureFailureScreenshot(page, 'coupons-negative-validation');
      throw error;
    }
  });

  test('create: submit valid coupon and see it in the list', async ({ page }) => {
    try {
      await page.goto(COUPONS_CREATE);
      await expect(page.getByRole('heading', { name: /إضافة كوبون جديد/ })).toBeVisible();

      await fillCouponForm(page, coupon);

      const createResponse = page.waitForResponse(
        (res) =>
          res.url().includes('/dashboard-api/v1/coupons') &&
          res.request().method() === 'POST' &&
          res.status() < 500,
        { timeout: 30000 },
      );

      await page.getByRole('button', { name: 'حفظ' }).click();
      const res = await createResponse;
      expect(res.ok(), `Create API should succeed, got ${res.status()}`).toBeTruthy();

      // Prefer ID from API body when available
      try {
        const body = await res.json();
        const id =
          body?.data?.id ??
          body?.data?.coupon?.id ??
          body?.id;
        if (id != null) couponId = String(id);
      } catch {
        // ignore parse errors
      }

      await page.goto(COUPONS_LIST);
      await expect(page.getByRole('heading', { name: /إدارة كوبونات خصم/ })).toBeVisible();
      const row = page.locator('table tbody tr').filter({ hasText: coupon.code });
      await expect(row).toBeVisible({ timeout: 15000 });
      await expect(row).toContainText(coupon.nameAr);
      await expect(row).toContainText(coupon.discount);

      // Resolve ID from the show navigation (most reliable vs nested API shapes)
      await row.locator('button.btn_show').click();
      await expect(page).toHaveURL(/\/coupons\/show\/\d+/, { timeout: 15000 });
      couponId = page.url().match(/\/show\/(\d+)/)?.[1] ?? couponId ?? '';
      expect(couponId, 'Could not resolve coupon id after create').toBeTruthy();
    } catch (error) {
      await captureFailureScreenshot(page, 'coupons-create');
      throw error;
    }
  });

  test('read: created coupon details display correctly', async ({ page }) => {
    try {
      expect(couponId, 'couponId from create step').toBeTruthy();

      // List view (primary read surface in this module)
      await page.goto(COUPONS_LIST);
      const row = page.locator('table tbody tr').filter({ hasText: coupon.code });
      await expect(row).toBeVisible({ timeout: 15000 });
      await expect(row).toContainText(coupon.nameAr);
      await expect(row).toContainText(coupon.discount);

      // Detail data is reliably bound on the edit form
      await page.goto(`/dashboard/coupons/edit/${couponId}`);
      await expect(page.getByRole('heading', { name: /تعديل الكوبون/ })).toBeVisible();

      const nameAr = page
        .locator('.input_wrapper')
        .filter({ hasText: /الاسم بالعربية/ })
        .locator('input')
        .first();
      await expect(nameAr).toHaveValue(coupon.nameAr, { timeout: 20000 });
      await expect(
        page.locator('.input_wrapper').filter({ hasText: /الاسم بالإنجليزية/ }).locator('input').first(),
      ).toHaveValue(coupon.nameEn);
      await expect(
        page.locator('.input_wrapper').filter({ hasText: /الكود/ }).locator('input.form-control').first(),
      ).toHaveValue(coupon.code);
      await expect(
        page.locator('.input_wrapper').filter({ hasText: /نسبة الخصم|قيمة الخصم/ }).locator('input[type="number"]').first(),
      ).toHaveValue(coupon.discount);
    } catch (error) {
      await captureFailureScreenshot(page, 'coupons-read');
      throw error;
    }
  });

  test('update: edit coupon and verify changes persisted', async ({ page }) => {
    try {
      expect(couponId, 'couponId from create step').toBeTruthy();
      await page.goto(`/dashboard/coupons/edit/${couponId}`);
      await expect(page.getByRole('heading', { name: /تعديل الكوبون/ })).toBeVisible();

      const nameArInput = page
        .locator('.input_wrapper')
        .filter({ hasText: /الاسم بالعربية/ })
        .locator('input')
        .first();
      await expect(nameArInput).toHaveValue(/.+/, { timeout: 15000 });
      await nameArInput.fill(updatedNameAr);

      const updateResponse = page.waitForResponse(
        (res) =>
          res.url().includes('/coupons') &&
          ['PUT', 'POST', 'PATCH'].includes(res.request().method()) &&
          res.status() < 500,
        { timeout: 30000 },
      );

      await page.getByRole('button', { name: 'حفظ' }).click();
      const res = await updateResponse;
      expect(res.ok(), `Update API should succeed, got ${res.status()}`).toBeTruthy();

      await page.goto(COUPONS_LIST);
      const row = page.locator('table tbody tr').filter({ hasText: coupon.code });
      await expect(row).toBeVisible();
      await expect(row).toContainText(updatedNameAr);

      await page.goto(`/dashboard/coupons/edit/${couponId}`);
      await expect(
        page.locator('.input_wrapper').filter({ hasText: /الاسم بالعربية/ }).locator('input').first(),
      ).toHaveValue(updatedNameAr, { timeout: 15000 });
    } catch (error) {
      await captureFailureScreenshot(page, 'coupons-update');
      throw error;
    }
  });

  test('delete: remove coupon and verify it no longer appears', async ({ page }) => {
    try {
      expect(couponId, 'couponId from create step').toBeTruthy();
      await page.goto(COUPONS_LIST);

      const row = page.locator('table tbody tr').filter({ hasText: coupon.code });
      await expect(row).toBeVisible();

      const deleteResponse = page.waitForResponse(
        (res) =>
          res.url().includes('/coupons') &&
          (res.request().method() === 'DELETE' || res.url().includes(couponId)) &&
          res.status() < 500,
        { timeout: 30000 },
      ).catch(() => null);

      await row.locator('button.btn_delete').click();
      await confirmDeleteIfPrompted(page);
      await deleteResponse;

      await expect(page.locator('table tbody tr').filter({ hasText: coupon.code })).toHaveCount(0, {
        timeout: 15000,
      });
    } catch (error) {
      await captureFailureScreenshot(page, 'coupons-delete');
      throw error;
    }
  });
});

// Independent of serial CRUD so a show-page product bug does not skip Update/Delete
test('coupons show page populates disabled detail fields', async ({ page }) => {
  try {
    await page.goto(COUPONS_LIST);
    await expect(page.getByRole('heading', { name: /إدارة كوبونات خصم/ })).toBeVisible();

    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toBeVisible();
    const expectedCode = (await firstRow.locator('td').nth(1).innerText()).trim();

    await firstRow.locator('button.btn_show').click();
    await expect(page).toHaveURL(/\/coupons\/show\/\d+/);
    await expect(page.getByRole('heading', { name: /عرض الكوبون/ })).toBeVisible();

    const codeInput = page
      .locator('.input_wrapper')
      .filter({ hasText: /الكود/ })
      .locator('input.form-control')
      .first();
    await expect(codeInput).toHaveValue(expectedCode, { timeout: 10000 });
  } catch (error) {
    await captureFailureScreenshot(page, 'coupons-show-empty-fields');
    throw error;
  }
});
