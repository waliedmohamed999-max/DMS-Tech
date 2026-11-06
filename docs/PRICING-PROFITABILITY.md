# Pricing & profitability — /offers (2026-11-05)

The package prices were raised by about 10% on 2026-11-05 and rounded to …99. These packages are unchanged pending review: WhatsApp, the tech team and Ads trial. Ads trial was narrowed to one campaign and two creatives so it stays smaller than the monthly Essential plan.

Four offers run 1–14 Dec 2026, after the raised prices are live, priced 13–18% below the current packages. Each offer's contents, exclusions and struck price come from its packages; the struck price is computed, never typed. Approved offers that haven't started yet show as a preview in development only. Tests check that an offer is never dearer than a permanent plan for the same thing.

Prices live in `src/content/offers.ts` (SAR, before 15% VAT). The profitability model is `src/lib/commercial/profitability.ts`; it is a design, not an admin screen. A screen can be added once finance approves the cost inputs.

## Rules the code enforces

| Rule | Where |
|---|---|
| Every package states its billing type: `one-time`, `monthly`, or `term` (the total for `termMonths`). | `Tier.billing`, `Tier.termMonths` |
| A "from" price applies to the stated base scope only. `indicative` shows "initial indication from". | `Tier.from`, `Tier.indicative` |
| Groups marked `draft` render in development only. They are left out of the page, the form label, the reference price, structured data and the sitemap. | `visibleGroups()` |
| Campaigns never renew by themselves. A campaign shows only when it has an approval (`approved`) and only between `startsAt` and `endsAt`, which are Riyadh days with the end day included. | `offerStatus()` |
| A campaign's struck price is the **current** price of the packages in its `basis`. A campaign is never shown if it is not cheaper than that price, or if it is built on a "from" price or a draft package. | `basisPrice()` |
| The stopped daily and weekly deal links redirect permanently (308) to the package each deal was built on. The redirect keeps the UTM parameters and click IDs. | `retiredOffers`, `/offers/[slug]` |
| The CRM lead and the e-mail get the package and its reference price (amount, billing, before VAT). The server resolves both from the key; the visitor never sends them. | `offerReference()`, `captureWebsiteLead`, `buildLeadMail` |
| The VAT-inclusive price is shown to the halala (×1.15, rounded). | `vatMoney()` in `src/lib/content.ts` |

## Profitability model

One **cost sheet** covers one sale of a package: one project, one month of a monthly plan, or the whole term of a term plan.

| Input | Meaning |
|---|---|
| `hours` × `hourlyCost` | Estimated delivery hours × the real cost of one hour of the employee or freelancer |
| `managementAndQa` | Project management and testing |
| `toolsAndHosting` | Tools, licences and hosting that the package itself includes |
| `expectedSupport` | Support included after delivery |
| `overhead` | The share of overheads allocated to one sale |
| `approvedBy` | Who approved the figures, and when |

```
total cost = hours × hourlyCost + managementAndQa + toolsAndHosting + expectedSupport + overhead
profit     = price − total cost
margin %   = (price − total cost) ÷ price × 100
```

`assess()` returns one of these statuses:

- `on-target` — margin of 30–40%.
- `below-target` — margin under 30%.
- `above-target` — margin over 40%.
- `needs-financial-approval` — the package has no approved cost sheet or no fixed price.

The 30–40% band is a review target. It is not a guarantee and not a rule for every service.

**Today `costSheets` is empty.** Every package therefore reports `needs-financial-approval`. No salary, cost or margin figure has been invented. To assess a package, finance adds its real figures under the package key, for example `costSheets["web-growth"] = { … , approvedBy: "<name> — <date>" }`.

## Dedicated tech team: what the published prices imply

The figures below are arithmetic on the published prices only. The prices themselves are unchanged. The 120 hours are shared by the whole team; they are not per person.

| Plan | Per month | Contract value | Price per team-hour | Highest cost per team-hour for a 30% margin |
|---|---|---|---|---|
| Monthly | 13,500 | 13,500 | 112.50 | 78.75 |
| Six-month | 12,400 | 74,400 | 103.33 | 72.33 |
| Annual | 11,200 | 134,400 | 93.33 | 65.33 |

The real blended hourly cost of the developer, designer and project manager is not in the repository. Finance must compare it with the last column before these prices are confirmed. If the cost is above that column, the annual plan earns less than 30%.

## 90-day integrated plans (draft)

The comparison below uses the nearest separate packages; the scopes differ slightly.

| Plan | Monthly average | Nearest separate packages per month | Difference |
|---|---|---|---|
| Essential 10,500 | 3,500 | Social Essential 1,999 + Ads Essential 2,199 = 4,198 | −17% |
| Professional 21,000 | 7,000 | Social Professional 3,899 + Ads Professional 4,399 = 8,298 | −16% |
| Complete 37,500 | 12,500 | Social Advanced 6,599 + Ads Advanced 8,299 = 14,898 | −16% |

The bundles therefore work as a commitment discount, and the discount grows with the plan. They stay `draft` until their delivery cost is approved.

## Waiting for approval

- A cost sheet for every package. Until then every package reports "needs financial approval".
- The 90-day plans (draft).
- "Ready to advertise" (`ads-launch`): its price of 1,499 and its scope are unchanged pending financial review.
- Proposed limits written into the packages:
  - **Ad spend covered by the fee:** 5,000 / 5,000 / 15,000 / 40,000.
  - **Enterprise website base scope:** 20 pages, 3 roles, 1 integration.
  - **AI limits:** data sources, integrations and users.
  - **Social media:** videos up to 60 seconds, one revision round per post or video.
- WhatsApp packages: prices unchanged until Meta's fees and the subscriptions are reviewed.
- Tech team: prices unchanged until the cost study above is done.
