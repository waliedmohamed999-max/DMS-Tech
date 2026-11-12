import { test, expect } from "../fixtures";

/** Public website smoke: both locales, offers, quote form validation (no submission), careers. */

test.describe("locales", () => {
  test("/ renders Arabic RTL", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page).toHaveTitle(/\S/);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("/en renders English LTR", async ({ page }) => {
    const res = await page.goto("/en");
    expect(res?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page).toHaveTitle(/\S/);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("/ar redirects to the unprefixed default locale", async ({ page }) => {
    await page.goto("/ar");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  });
});

test("offers page loads", async ({ page }) => {
  for (const path of ["/offers", "/en/offers"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    // at least one link into the quote form (packages / offers lead there)
    await expect(page.locator('a[href*="quote"], a[href*="/offers/"]').first()).toBeAttached();
  }
});

test("careers page renders", async ({ page }) => {
  for (const [path, title] of [["/careers", "التوظيف"], ["/en/careers", "Careers"]] as const) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.locator("#jobs")).toBeAttached();
    await expect(page.getByText(title).first()).toBeVisible();
  }
});

test.describe("quote form validation (nothing is submitted)", () => {
  for (const { path, submit, required, invalid } of [
    { path: "/en/quote", submit: "Send request", required: "Please enter your name and a phone number or email.", invalid: "Please enter a valid phone number or email." },
    { path: "/quote", submit: "أرسل الطلب", required: "من فضلك أدخل الاسم ووسيلة تواصل (جوال أو بريد).", invalid: "من فضلك أدخل رقم جوال أو بريداً إلكترونياً صحيحاً." }
  ]) {
    test(`${path}: empty submit shows the required-field error`, async ({ page }) => {
      let leadRequests = 0;
      page.on("request", (r) => {
        if (new URL(r.url()).pathname === "/api/leads") leadRequests++;
      });
      await page.goto(path);
      const form = page.locator("form").filter({ has: page.locator("#lf-name") });
      await expect(form.getByRole("textbox", { name: /Name|الاسم/ })).toBeVisible();
      await form.getByRole("button", { name: submit }).click();
      await expect(form.getByRole("alert")).toHaveText(required);

      // name present but malformed contact → field-format error
      await form.locator("#lf-name").fill("E2E Test");
      await form.locator("#lf-email").fill("not-an-email");
      await form.getByRole("button", { name: submit }).click();
      await expect(form.getByRole("alert")).toHaveText(invalid);

      expect(leadRequests, "the form must not reach /api/leads on invalid input").toBe(0);
    });
  }

  test("?service= preselects the service", async ({ page }) => {
    await page.goto("/en/quote?service=nova-ai");
    await expect(page.locator("#lf-service")).toHaveValue("nova-ai");
  });
});
