import { test, expect, checkA11y } from "../fixtures";

/**
 * axe-core WCAG 2.1 AA scans. SOFT for now: violations are annotated + attached to the HTML report, not failed
 * (E2E_A11Y_STRICT=1 makes them blocking).
 */
for (const { path, label } of [
  { path: "/", label: "home-ar" },
  { path: "/en", label: "home-en" },
  { path: "/quote", label: "quote-ar" },
  { path: "/en/quote", label: "quote-en" }
]) {
  test(`a11y: ${label} (${path})`, async ({ page }, testInfo) => {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const violations = await checkA11y(page, testInfo, label);
    console.log(`[a11y] ${label}: ${violations.length} rule(s) violated${violations.length ? " — " + violations.map((v) => `${v.id}×${v.nodes}`).join(", ") : ""}`);
  });
}
