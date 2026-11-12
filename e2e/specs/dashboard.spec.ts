import { test, expect } from "../fixtures";

/** Business OS (/app) access: anonymous redirect and bootstrap-admin sign-in. */

test("/app without a session redirects to /app/login", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/login\?next=%2Fapp$/);
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
});

test("a deep /app link keeps its target in ?next", async ({ page }) => {
  await page.goto("/app/crm");
  await expect(page).toHaveURL(/\/app\/login\?next=%2Fapp%2Fcrm$/);
});

test("wrong password is refused", async ({ page }) => {
  await page.goto("/app/login");
  await page.locator('input[name="email"]').fill("nobody@example.com");
  await page.locator('input[name="password"]').fill("definitely-wrong");
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator("[data-login-error]")).toBeVisible();
  await expect(page).toHaveURL(/\/app\/login/);
});

test("bootstrap admin can sign in", async ({ page, context }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!email || !password, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set");

  await page.goto("/app/login");
  await page.locator('input[name="email"]').fill(email!);
  await page.locator('input[name="password"]').fill(password!);
  await page.locator('form button[type="submit"]').click();

  // staging / production bootstrap issues a temporary password → forced change page; test/dev → the dashboard
  await expect(page).toHaveURL(/\/app(\/me\?force=1)?$/);
  const cookies = await context.cookies();
  expect(cookies.some((c) => /dms_os$/.test(c.name) && c.httpOnly)).toBe(true);
  await expect(page.locator("[data-login-error]")).toHaveCount(0);

  // the session really works: a protected page no longer bounces to the login screen
  await page.goto("/app/me");
  await expect(page).toHaveURL(/\/app\/me/);
});
