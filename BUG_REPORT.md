# Coupons Module — Bug Report

Failures only. Credentials and `.env` values are omitted.

---

## BUG-001: Coupon show/detail page does not populate field values

| Field | Value |
|-------|--------|
| **Severity** | High (detail view unusable for verifying data) |
| **Status** | Confirmed by automated test |
| **Screenshot** | `test-results/screenshots/coupons-show-empty-fields.png` |
| **Also:** | `test-results/coupons-coupons-show-page-populates-disabled-detail-fields-main/test-failed-1.png` |

### Steps to reproduce

1. Log in to the dashboard.
2. Open **إدارة أكواد الخصم** (`/dashboard/coupons/all`).
3. Click the eye (**عرض**) control on any coupon row.
4. Observe `/dashboard/coupons/show/{id}` titled **عرض الكوبون**.

### Expected

Disabled form fields (الاسم بالعربية، الاسم بالإنجليزية، الكود، نسبة الخصم، dates, etc.) display the coupon’s saved values.

### Actual

All detail inputs render empty (`value=""`), even though:

- The same coupon’s data is correct in the **list** table.
- The same coupon’s data loads correctly on **`/dashboard/coupons/edit/{id}`**.

### Assertion that failed

```text
expect(codeInput).toHaveValue(expectedCode)
Expected: "<coupon-code-from-list-row>"
Received: ""
```

Locator: `.input_wrapper` filtered by label **الكود** → `input.form-control` (disabled).

### Notes

- List has **no Edit** control; edit works only via URL `/dashboard/coupons/edit/{id}` (packages module exposes `btn_edit`; coupons do not). That is a usability gap, not the same as this show-page data bug.
- CRUD create/update/delete and list/edit read paths work; only the show/detail binding appears broken.
