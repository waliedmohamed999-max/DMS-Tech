// Prints the soft axe-core findings written by e2e/fixtures.ts (checkA11y) as a Markdown table (CI step summary).
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "test-results");
const files = [];
const walk = (d) => {
  if (!existsSync(d)) return;
  for (const f of readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/^axe-.*\.json$/.test(f.name)) files.push(p);
  }
};
walk(root);

console.log("## Accessibility (axe-core, WCAG 2.1 AA) — soft findings\n");
if (!files.length) {
  console.log("No axe results found (did the a11y specs run?).");
  process.exit(0);
}
// a retried test writes twice — keep one result per page label
const byLabel = new Map();
for (const f of files) {
  const r = JSON.parse(readFileSync(f, "utf8"));
  byLabel.set(r.label, r);
}
console.log("| Page | Rule | Impact | Nodes | Help |\n|---|---|---|---|---|");
for (const r of [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label))) {
  if (!r.violations.length) console.log(`| ${r.label} | — | — | 0 | no violations |`);
  for (const v of r.violations) console.log(`| ${r.label} | [${v.id}](${v.helpUrl}) | ${v.impact} | ${v.nodes} | ${v.help.replace(/\|/g, "\\|")} |`);
}
