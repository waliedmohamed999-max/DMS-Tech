# Business OS — Subscriptions

This module records a client's subscription to a recurring package, such as:
- ads or social media management;
- WhatsApp plans;
- the dedicated tech team;
- retainers.

It covers the plan and its price, the minimum term, renewal, pause and cancellation, and billing.

| Route | What it shows |
|---|---|
| `/app/subscriptions` | MRR / ARR, active / paused / ending counts, renewals within 30 days, new and churned in 30 days, unbilled subscriptions; the list (filters: current, status, renewing soon, not billed); new subscription (`?new=1`) |
| `/app/subscriptions/[id]` | Plan and price (with VAT, monthly equivalent), term and renewal, client / contact / account manager / contract, billing schedule and its invoices, full history; every action |
| Client 360 → Finance | The client's subscriptions and a new subscription for that client |

Code: `src/server/subscriptions/subscriptions.ts`. Tests: `tests/subscriptions.test.ts`. Migration: `20261105150000_subscriptions`.

## Model

**`Subscription`** (`SUB-000001`) holds:
- client, optional contact, account manager, contract and catalog service;
- the website package key it came from;
- name, billing interval (MONTHLY / QUARTERLY / SEMIANNUAL / ANNUAL), price per period before VAT, and tax behaviour;
- term fields:

| Field | Meaning |
|---|---|
| `startDate` | First day of service |
| `commitmentMonths` | Minimum term (0 = none). Must be a multiple of the billing interval. |
| `termEndDate` | Last day of the current term. The first term ends at start + commitment. `null` means an open-ended, rolling subscription. |
| `autoRenew`, `renewalMonths` | At the end of a term, a new term of `renewalMonths` starts. Without renewal, the subscription ends with the term. |
| `cancelAt` | Last day of service once a cancellation is scheduled or done |

**`SubscriptionChange`** is the timeline. Its kinds are:
- CREATED, PLAN_CHANGED, PAUSED, RESUMED;
- CANCEL_SCHEDULED, CANCEL_REVOKED, RENEWED, ENDED;
- BILLING_STARTED, NOTE.

Each entry has an effective date, before / after values, a note and the actor.

**Statuses:**
- ACTIVE → PAUSED → ACTIVE
- ACTIVE / PAUSED → ENDING (cancellation scheduled) → ENDED
- any status → ENDED, either with "cancel now" or when a term ends without renewal

## Billing

Billing is delegated to **one linked `RecurringInvoice` schedule** (see [FINANCE.md](FINANCE.md)). Its line is `<name> — {period}`. The service layer keeps it in step:

| Subscription event | Schedule |
|---|---|
| Created with billing | A schedule from the start date. A start of today or earlier bills right away, catching up at most 3 periods. |
| Recorded without billing (no `finance.invoices.create`) | No schedule. It shows as "not billed" until finance clicks **Switch billing on**, and billing then starts with the first period that begins today or later. |
| Plan / price change | The schedule's line changes. It applies from the next invoice; issued invoices never change. |
| Pause | Schedule PAUSED |
| Resume | Schedule ACTIVE, and the next run moves to the first period starting today or later. **Paused periods are never billed.** |
| Cancellation scheduled | Schedule `endDate` = last day of service. Periods starting after it are not billed. |
| Automatic renewal turned off | Schedule `endDate` = end of the current term |
| Cancellation undone / renewal turned back on | The end date is lifted, and a schedule that stopped only at that end resumes |
| Cancel now / term over / cancellation date passed | Schedule ENDED |

A subscription's schedule cannot be paused, resumed or ended on its own. `/app/finance/recurring/[id]` shows the link, and the service refuses with `MANAGED_BY_SUBSCRIPTION`.

## Sweep

`sweepSubscriptions` runs under the billing-automation lease (finance sweep / worker), **before** the recurring schedules. It is idempotent and does three things:

1. **ENDING past its last day.** The subscription becomes ENDED, its schedule is ENDED, and `subscription.ended` is emitted.
2. **Term over.**
   - With automatic renewal, `termEndDate` moves forward by `renewalMonths`, once per missed term (RENEWED, `subscription.renewed`).
   - Without automatic renewal, the subscription becomes ENDED (`TERM_ENDED`).
3. **Renewal notice.** `RENEWAL_NOTICE_DAYS` (30) before the term ends, `subscription.renewal_due` goes out once per term. It is claimed with `renewalNoticeFor`.

**Notifications** (category SALES) go to the account manager. When there is none, they go to every holder of `subscriptions.manage`. They are deduplicated per term.

## Cancellation

The options are: at the end of the current term, on a date (the last day of service), or now.
- A date inside the minimum term is allowed, but is recorded as an **early termination** (`early: true`). The commercial consequence is agreed with the client; nothing is charged automatically.
- Past dates and dates before the start are refused.
- A scheduled cancellation can be undone while the subscription is ENDING.

## Permissions

| Key | Meaning |
|---|---|
| `subscriptions.view` | List, detail, metrics, client section |
| `subscriptions.manage` | Create, change plan / price, renewal and owner, pause / resume, cancel / undo, notes |
| `finance.invoices.create` | Additionally needed to switch billing on and to change the price of a billed subscription. The schedule runs as its creator with that person's current permissions (FINANCE.md). |

**Roles:**
- `finance_manager`, `accountant` and `sales_manager` can view and manage.
- `sales_rep` can view.
- CEO and GM get both through the catalog.

New keys reach existing roles only after `cpanel:bootstrap` / `os:bootstrap`.

## Website packages

The new-subscription form offers the **published** `/offers` packages that can be subscribed to:
- monthly plans, with their yearly price;
- term plans of 3, 6 or 12 months.

Draft groups, one-time projects and "from" prices are left out. The minimum term is read from the package's own wording ("الحد الأدنى 3 أشهر"), never assumed, and every prefilled value stays editable.

## Not in scope

- Proration of a mid-period price change, and credit notes. The new price applies from the next invoice; a manual invoice covers anything else.
- Usage-based charges, such as Meta's message fees, which the client pays directly.
- Online card payments or automatic collection.
