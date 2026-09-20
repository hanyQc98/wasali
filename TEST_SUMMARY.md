# Coupons Module — Test Summary

**Target:** Coupons CRUD (`/dashboard/coupons/*`)  
**Runner:** Playwright (`tests/coupons.spec.ts` + `tests/auth.setup.ts`)  
**Auth:** `setup` project → `playwright/.auth/user.json` → `main` project (no per-test login)  
**Run date:** 2026-09-10

## Exploration notes (UI)

| Action | Available? | How |
|--------|------------|-----|
| Create | Yes | Link **إضافة كوبون جديد** → `/dashboard/coupons/create` |
| Read (list) | Yes | Table on `/dashboard/coupons/all` |
| Read (detail/show) | Yes (UI) | Eye button → `/dashboard/coupons/show/{id}` — **fields stay empty** (see bug report) |
| Update | Yes (no list edit button) | Direct `/dashboard/coupons/edit/{id}` (same fields as create) |
| Delete | Yes | Trash button → confirm dialog (**حسنًا** / **إلغاء**) |
| Status toggle | Yes | Switch in list **الحالة** column |

**Create/edit required fields:** الاسم بالعربية، الاسم بالإنجليزية، الكود، نوع الخصم، قيمة/نسبة الخصم، عدد الاستخدامات (+ عدد مرات الاستخدام when limited)، تاريخ البدء، تاريخ النهاية.

**Validation:** Empty submit POSTs to API and returns **422** with Arabic messages containing **مطلوب**.

## Results

| Test case | Action tested | Expected result | Actual result | Pass/Fail |
|-----------|---------------|-----------------|---------------|-----------|
| `[setup] authenticate` | Login + save `storageState` | Auth file saved; dashboard reachable | Succeeded | **PASS** |
| `negative: empty required fields shows validation` | Create with empty required fields | Stay on create; 422 and/or validation UI | 422 received; stayed on create | **PASS** |
| `create: submit valid coupon and see it in the list` | Create valid coupon | New row with code/name/discount in list | Coupon appeared in list; ID resolved via show URL | **PASS** |
| `read: created coupon details display correctly` | Read list + edit form values | List and edit form show created data | List + edit form matched created data | **PASS** |
| `update: edit coupon and verify changes persisted` | Update Arabic name | List + edit form show updated name | Changes persisted | **PASS** |
| `delete: remove coupon and verify it no longer appears` | Delete + confirm | Row gone from list | Row removed after **حسنًا** confirm | **PASS** |
| `coupons show page populates disabled detail fields` | Read via show/detail page | Disabled inputs show coupon data (e.g. code) | Inputs remain empty (`""`) | **FAIL** |

**Totals:** 6 passed, 1 failed (plus setup). Serial CRUD path (Create → Read → Update → Delete) + negative case: **all passed**.
