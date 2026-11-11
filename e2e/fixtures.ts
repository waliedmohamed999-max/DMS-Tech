import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";

/**
 * Shared fixtures:
 *  - every page may only talk to the app under test: requests to any other origin (fonts, analytics, wa.me, maps…)
 *    are aborted, so the suite is deterministic and can never send anything to an external service;
 *  - `/api/leads` is refused too unless a test opts in — the smoke suite never creates real leads.
 */
export const test = base.extend<{ allowLeadSubmission: boolean }>({
  allowLeadSubmission: [false, { option: true }],
  page: async ({ page, baseURL, allowLeadSubmission }, provide) => {
    const appOrigin = new URL(baseURL ?? "http://localhost:3000").origin;
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.protocol === "data:" || url.protocol === "blob:") return route.continue();
      if (url.origin !== appOrigin) return route.abort("blockedbyclient");
      if (!allowLeadSubmission && url.pathname === "/api/leads") return route.fulfill({ status: 418, body: "blocked by e2e" });
      return route.continue();
    });
    await provide(page);
  }
});

export { expect };

/** WCAG 2.0 / 2.1 level A + AA rules. */
export const WCAG_21_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Runs axe-core (WCAG 2.1 AA) and records violations as SOFT findings: one test annotation per rule plus a JSON
 * attachment in the HTML report. It does not fail the test (yet) — flip `E2E_A11Y_STRICT=1` to make it blocking once
 * the backlog is fixed.
 */
export async function checkA11y(page: Page, testInfo: TestInfo, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_21_AA).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(" "))
  }));
  // on disk too (e2e/test-results/**/axe-<label>.json) so CI can print a summary table
  const file = testInfo.outputPath(`axe-${label}.json`);
  await writeFile(file, JSON.stringify({ label, url: page.url(), violations: summary }, null, 2));
  await testInfo.attach(`axe-${label}.json`, { path: file, contentType: "application/json" });
  for (const v of summary) {
    testInfo.annotations.push({ type: "a11y-violation", description: `[${label}] ${v.id} (${v.impact}, ${v.nodes} node${v.nodes === 1 ? "" : "s"}): ${v.help}` });
  }
  if (process.env.E2E_A11Y_STRICT === "1") expect(summary, `axe WCAG 2.1 AA violations on ${label}`).toEqual([]);
  return summary;
}
