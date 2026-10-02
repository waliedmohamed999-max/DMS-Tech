# Business OS — Finance (Phase 5): Invoicing, Payments, Receivables, Expenses, Profitability

Operational finance for DMS Tech: **billing → collection → receivables**, **spending → approval → payment**, and **project / client profitability estimates**. It is **not** an accounting system: there is no general ledger, P&L, balance sheet, trial balance, bank reconciliation or revenue recognition.

Terminology used everywhere in the UI and code: **Billed** = issued invoice totals · **Collected** = recorded (non-reversed) payments · **Outstanding** = invoice balances · **Margin** = operational estimate. Quotation and contract values are commitments — never labelled revenue.

## Routes

| Route | Purpose |
|---|---|
| `/app/finance` | Dashboard: invoices issued, billed, collected, collection rate, outstanding, overdue, expenses, project direct cost (period presets), attention list, aging summary |
| `/app/finance/invoices` | List (search, status / owner filters, sortable, totals in company currency, CSV export) |
| `/app/finance/invoices/new` | Billing sources with eligibility + "Create invoice" per source · `?mode=manual` manual invoice editor |
| `/app/finance/invoices/[id]` | Header (number, client, status, total, balance), actions (edit draft, issue, PDF AR/EN, original PDF, mark sent, record payment, cancel / void), tabs **Overview · Lines · Payments · Activity · Source**; `?edit=1` draft editor |
| `/app/finance/invoices/[id]/pdf` | Current copy from the frozen snapshot (`?lang=ar|en`) or `?original=1` = stored issued bytes |
| `/app/finance/receivables` | AR aging buckets (current, 1–30, 31–60, 61–90, 90+) by client and invoice, follow-ups |
| `/app/finance/payments`, `/[id]` | Payments list / record (`?new=1&invoice=`) / allocation detail / reversal |
| `/app/finance/expenses`, `/[id]` | Expense list (own claims or all for finance), create / submit / withdraw / pay / cancel |
| `/app/finance/vendors` | Vendor directory with spend, archive / restore (no delete) |
| `/app/finance/reports` | Billed and collected by month, outstanding by client, billed by service, expenses by category / project, project profitability |
| `/app/finance/setup` | Expense categories · hourly cost rates |
| `/app/finance/export/{invoices|payments|expenses|aging}` | CSV (UTF-8 BOM), same filters + scope as the list, audited `finance.exported` |
| Client 360 → **Finance** | invoiced / paid / outstanding / overdue, invoices, payments |
| Project → **Finance** | contract value, billed, collected, outstanding, ready-to-invoice sources, expenses, direct cost, margin |

## Data model (migration `20261002090000_phase5_finance`, additive)

`Invoice` · `InvoiceItem` · `InvoiceTimeEntry` · `InvoiceCollectionNote` · `Payment` · `PaymentAllocation` · `Expense` · `ExpenseCategory` · `Vendor` · `UserCostRate`; `CommercialDocument.invoiceId` + kind `INVOICE_PDF`; organization settings `invoiceDueDays` (30), `invoiceDueSoonDays` (3), `invoicePaymentInstructions`, `expenseApprovalThreshold` (5 000), `largeOutstandingThreshold` (50 000), `defaultHourlyBillingRate` (null).

Database guarantees:
- **Invoice CHECKs** — amounts ≥ 0, `total = subtotal − discount + VAT`, `0 ≤ paid ≤ total`, `balance = total − paid`, `dueDate ≥ issueDate`, issued ⇒ number + issuedAt + content hash, PAID ⇒ balance 0 + paidAt, PARTIALLY_PAID ⇒ 0 < paid < total, SENT ⇒ sentAt, CANCELLED / VOID ⇒ timestamp + reason, VOID ⇒ nothing paid, and per-source reference rules.
- **Line CHECKs** — line arithmetic holds: `subtotal = gross − discount`, `total = subtotal + tax`, quantity > 0, VAT 0–100.
- **Billing dedup** (partial unique indexes on live = not CANCELLED/VOID invoices):
  - one invoice per contract milestone;
  - one per contract (CONTRACT source);
  - one per accepted quotation version;
  - one per completed project (PROJECT source);
  - one live link per time entry (`InvoiceTimeEntry_one_live_link`);
  - one stored PDF per invoice and language.
- **Triggers**:
  - `Invoice_freeze` — content immutable after DRAFT; no return to DRAFT; CANCELLED/VOID final.
  - `Invoice_no_delete` — issued invoices are never deleted.
  - `InvoiceItem_freeze` — lines of a non-draft invoice cannot change.
  - `Payment_guard` — amount / client / currency / date / number immutable; never deleted; no un-reversal.
  - `PaymentAllocation_append_only`.
  - `Expense_freeze` — content immutable outside DRAFT/REJECTED; PAID is final.
  - The append-only `CommercialDocument` trigger from Phase 3 now also covers invoice PDFs.
- **Payments / expenses CHECKs** — positive amounts, reversal needs a reason, expense `total = amount + VAT`, lifecycle timestamps (approved ⇒ approver, paid ⇒ payer, rejected ⇒ reason).

Numbers (atomic `Sequence` upsert, never `count()+1`):

| Series | Format | Assigned |
|---|---|---|
| Invoices | `INV-YYYY-NNNNNN` | at **issue** — drafts have no number, so issued numbers have no gaps from abandoned drafts |
| Payments | `PAY-YYYY-NNNNNN` | when recorded |
| Expenses | `EXP-YYYY-NNNNNN` | when created |
| Vendors | `VEN-NNNNNN` | when created |

## Billing eligibility (`src/server/finance/eligibility.ts`)

Deterministic rules, no AI; each candidate returns `eligible`, `type`, `id`, `reasons`, `blockers` and a suggested **net** amount when the commercial record defines one.

| Source | Eligible when | Amount suggestion |
|---|---|---|
| `CONTRACT_MILESTONE` | contract ACTIVE/EXPIRING, milestone not cancelled, and delivered (all linked project milestones completed — Phase 4 eligibility) **or** marked COMPLETED **or** due date reached | contract net × percentage (or × amount ÷ contract value) |
| `CONTRACT` | ACTIVE/EXPIRING contract **without** milestones | lines copied from the accepted version |
| `QUOTATION` | accepted quotation with no live contract (a contract always wins) | lines from the accepted version |
| `PROJECT` | COMPLETED client project whose contract is not billed by milestones / already invoiced | budget − already billed (net) |
| `TIME` | approved **and** billable time entries not linked to a live invoice | hours × `defaultHourlyBillingRate` (editable on the draft) |
| `MANUAL` | always, with `finance.invoices.create` | custom lines |

Blockers: `ALREADY_INVOICED`, `NOT_DUE_NOT_DELIVERED`, `DELIVERY_IN_PROGRESS`, `NO_AMOUNT`, `NO_ACCEPTED_VERSION`, `BILLED_BY_MILESTONES`, `CONTRACT_INVOICED`, `QUOTATION_INVOICED`.

Creating an invoice from a source (`createInvoiceFromSource`) works like this:
- Locks the source row (contract / quotation / project), re-evaluates eligibility inside the transaction, and creates a **DRAFT**. A concurrent duplicate hits the partial unique index and gets `ALREADY_INVOICED`.
- Upstream records (quotation, version, contract, project snapshot) are only **read**. Eligibility never creates an invoice by itself; the sweep only announces `contract_milestone.billing_ready` / `project.billing_ready`.
- Time billing links each exact entry (`InvoiceTimeEntry` with minutes).
- Cancelling or voiding the invoice **releases** the links (`releasedAt`), so the time becomes billable again. A void with replacement re-links the same entries to the new draft.
- A billed entry cannot be reopened for correction in Projects (`TIME_ENTRY_BILLED`).

## Invoice lifecycle

Manual actions:

| From | Action | To |
|---|---|---|
| DRAFT | issue | ISSUED |
| DRAFT | cancel (reason) | CANCELLED |
| ISSUED / OVERDUE / PARTIALLY_PAID | mark sent (method, confirmation) | SENT |
| ISSUED / SENT / OVERDUE, nothing paid | void (reason, optional replacement draft) | VOID |

Payment-driven states are **derived** (`deriveStatus`), never set by hand. In this order:
1. paid ≥ total → **PAID**
2. due date passed → **OVERDUE**
3. paid > 0 → **PARTIALLY_PAID**
4. otherwise **SENT** if delivery was recorded, else **ISSUED**

They are recomputed under the invoice row lock on every payment / reversal and by the sweep.

**Issue** does all of the following in one step:
- Locks the row and assigns the number.
- Snapshots the seller (company identity, VAT, CR), the buyer (client name, VAT number, address, contact) and the payment instructions.
- Computes a sha256 content hash.
- Renders the PDF and stores the exact bytes append-only.

Corrections after issue are **void + replacement invoice** — never hidden edits. Formal credit / debit notes are future work.

## VAT & calculations

Lines are calculated by the same decimal engine as quotations (`src/lib/commercial/calc.ts`, ROUND_HALF_UP to 2 decimals per line) with the **company VAT rate from settings** (no second VAT setting).
- The rate and amount are stored on each line; changing company VAT later never alters an issued invoice.
- Browser totals are ignored; the editor preview uses the same code purely for display.
- Currency: an invoice keeps its currency. Payments must match it. Dashboards and reports aggregate **company currency only** and say so; other currencies are counted and excluded (no FX conversion).

## Invoice PDF

`src/server/pdf/invoice.ts` reuses the Phase 3 engine (pdfkit, bundled IBM Plex Sans Arabic, own bidi layout).
- **Content**: DMS identity, number, dates, seller and client (with VAT numbers), references (contract / project / quotation), lines, subtotal, discount, VAT, total incl. VAT, paid, balance, payment instructions, terms, notes, content hash in the footer. Arabic and English.
- **Issued invoices** render only from their frozen snapshot — current company or client data is never read for them.
- **`?original=1`** returns the stored bytes from issue time (`X-Document-Source: stored-issued-artifact`).
- **The default copy** adds the payment status "as of" the company's current day.
- **Drafts** carry a DRAFT watermark.
- **Receipts**: payment receipt PDFs are not generated; no regulatory e-invoicing (ZATCA) claim is made.

## Payments, allocation, reversal (`payments.ts`)

Explicit policy:
- **Full allocation** — a payment belongs to one client and is fully allocated to that client's open invoices in the same currency (Σ allocations = amount). No unallocated credit, no overpayment; each allocation must be ≤ the invoice balance (checked under row locks, taken in a stable order to avoid deadlocks; the CHECK refuses paid > total).
- **Idempotency** — a resubmitted form with the same `idempotencyKey` returns the original payment, also under concurrency.
- **Reversal** — payments are never edited or deleted. A wrong payment is **reversed** (reason, actor, timestamp); every affected invoice is recomputed from its remaining non-reversed allocations in the same transaction.

## Receivables & collections

Aging uses `dueDate` and the remaining balance: `current` (not due), 1–30, 31–60, 61–90, 90+ days past due, per client and per invoice.

Collection activity is **recorded manually**: note / reminder (with channel) / promise to pay, plus a follow-up date. It updates `nextFollowUpAt` / `lastReminderAt`. The system never emails or messages clients.

## Expenses, approval, payment (`expenses.ts`)

| From | Action | To |
|---|---|---|
| DRAFT | submit | PENDING_APPROVAL (creates `Approval(type=EXPENSE)` in the Phase 1 engine) |
| PENDING_APPROVAL | approve | APPROVED |
| PENDING_APPROVAL | reject (reason required) | REJECTED → edit → resubmit |
| PENDING_APPROVAL | withdraw (submitter) | DRAFT |
| APPROVED | mark paid (method, reference, date) | PAID |
| DRAFT / REJECTED / APPROVED (unpaid) | cancel | CANCELLED |

Rules:
- **Approval tier** — total ≥ `expenseApprovalThreshold` needs `finance.expenses.approve_executive`; otherwise `finance.expenses.approve`.
- **Self-approval** — the engine blocks the requester; the handler also blocks the claimant (the person the expense is for).
- **Payment** — a conditional `APPROVED → PAID` update, so it cannot happen twice.
- **SUBMITTED** — from the suggested status list, it is merged into PENDING_APPROVAL, because submitting always opens the approval.
- **Categories** — 14 default categories are seeded idempotently ("Salaries" is a category only — payroll lives in People / Phase 6 and is not duplicated as expenses). Admins / finance can add, rename or deactivate them.

## Vendors

`VEN-NNNNNN`, contact, VAT number, category, payment terms, notes, ACTIVE / ARCHIVED.
- Archived vendors cannot be used on new expenses; historical expenses keep them.
- No hard delete (FK RESTRICT).
- Purchase orders / procurement are Phase 7.

## Costing & profitability (`costing.ts`)

| Item | Definition |
|---|---|
| Billed (net) | issued, non-void invoices of the project, excl. VAT |
| Collected | paid amounts |
| Direct cost | APPROVED + PAID project expenses, excl. VAT |
| Time cost | approved time × the person's `UserCostRate` valid on that date — **only where a rate exists**; coverage % is shown, no salary is assumed |
| Margin (est.) | Billed (net) − Direct cost − Time cost |

Cost rates (`UserCostRate`, history kept, previous rate closed automatically, audited `cost_rate.changed`) are internal costing metadata, **not payroll**. They are visible only with `finance.cost_rates.view` and never to project members. Contract value is shown separately as a commitment.

## Permissions & scopes

| Key | Purpose |
|---|---|
| `finance.dashboard.view` · `finance.reports.view` | dashboard · operational reports |
| `finance.records.all` | finance scope: all invoices / payments / expenses |
| `finance.invoices.view/create/edit/issue/send/cancel` | invoice lifecycle (`cancel` = cancel draft / void) |
| `finance.collections.manage` | collection notes, reminders, follow-ups |
| `finance.payments.view/create/reverse` | payments |
| `finance.expenses.view/create/submit/approve/approve_executive/pay` | expenses |
| `finance.vendors.view/manage` | vendors (manage also covers expense categories) |
| `finance.profitability.view` | cost, margin, profitability |
| `finance.cost_rates.view/manage` | hourly cost rates |

**Scope** (stricter than CRM, `access.ts`, AND-wrapped):
- **Invoices** — `finance.records.all` sees every invoice. Otherwise a user needs `finance.invoices.view` and then sees only invoices of clients in their CRM scope (sellers: `crm.opportunities.view` + `crm.clients.view`) or invoices linked to projects in their project scope.
- **Payments** — need `finance.payments.view`; without `finance.records.all`, only payments allocated to visible invoices.
- **Expenses** — own only (submitted or incurred) unless `finance.expenses.view` + `finance.records.all`.
- **Cost / margin / rates** — always need their own permissions.

| Role | Default |
|---|---|
| CEO / GM | Full finance visibility |
| Finance Manager | Everything |
| Accountant | Invoicing, payments (no reversal), expense approval (normal tier) and payment, vendors, dashboard / reports — no margins or cost rates |
| Sales Manager | Invoice status / balances of clients in CRM scope (no payments, expenses, costs or reports) |
| Sales Rep | Nothing (only if explicitly granted) |
| Project Manager | Billing status of their projects |
| Everyone | Create and submit own expenses |

Legacy keys are migrated on custom roles by bootstrap (audited, idempotent):
- `finance.invoices.manage` → view / create / edit / issue / send / cancel
- `finance.payments.manage` → payments view / create (**not** reverse)
- `finance.expenses.submit` gains `finance.expenses.create` (companion)

## Audit, events, notifications, sweep

**Audit**:
- **Invoices:** `invoice.created/updated/issued/sent/cancelled/voided/status_changed/collection_note/reminder_recorded/time_linked/overdue`.
- **Payments:** `payment.created/allocated/reversed`.
- **Expenses:** `expense.created/updated/submitted/withdrawn/approved/rejected/paid/cancelled`.
- **Other:** `vendor.created/updated/archived/restored`, `expense_category.*`, `cost_rate.changed`, `finance.exported`, `rbac.permissions_migrated`.

**Events**:
- `invoice.created/issued/sent/partially_paid/paid/overdue/due_soon/cancelled`
- `payment.recorded/reversed`
- `expense.submitted/approved/rejected/paid/payment_due`
- `project.billing_ready`, `contract_milestone.billing_ready`, `vendor.created`

Consumers never mutate projects or contracts.

**Notifications** (category INVOICE, `dedupeKey`, actor never notified):

| Event | Recipients |
|---|---|
| invoice overdue / due soon | owner (fallback: collectors) |
| payment recorded | invoice owners |
| invoice fully paid | owner |
| expense approved / rejected / paid | submitter |
| approved expense awaiting payment | payers |
| project / milestone ready for billing | billers |

Expense approval requests use the engine's own notifications.

**Sweep** (`npm run finance:sweep`, plus lazily from finance pages and the Command Center, throttled to 5 min):
- Runs under the Phase 4 `JobLease` (`sweep:finance:{org}`).
- Moves late invoices to OVERDUE and emits `invoice.overdue` exactly once per invoice (claim `overdueNotifiedAt`).
- Emits due-soon once (`dueSoonNotifiedAt`), billing-ready once per source, and an expense-payment reminder once (`payReminderAt`).

## Command Center, search, quick create

- **KPIs**: Billed this month, Collected, Receivables, Expenses — company currency, with the previous period.
- **Billing & collection panel**, with aging bars.
- **Attention**: invoices overdue / due soon, clients above the large-balance threshold, approved expenses to pay, milestones and completed projects ready to invoice.
- **Global search**: invoices, payments, expenses, vendors — each group needs its permission and scope.
- **Create menu**: Invoice, Payment, Expense, Vendor (only when permitted).

## Known limitations

- **Not built**: no credit / debit notes (void + replacement instead), no client credit / unallocated payments, no payment receipts PDF, no ZATCA e-invoicing / QR, no email / WhatsApp sending, no payment gateway, no FX.
- **No recurring billing**: retainer / recurring periods are not modelled (subscriptions are planned, Phase 8 area).
- **No attachments**: receipts / attachments wait for the documents module; a receipt reference field is used meanwhile.
- **Time billing**: uses one org-wide suggested hourly rate (editable per draft line); per-person / per-project billing rates are future work. Hours are rounded to 3 decimals on the line; exact minutes are kept on the link rows.
- **Simplified scope**: the sales-manager finance scope is invoice status only; per-department expense scopes are not implemented (own vs all).

## Payroll (Phase 6) and finance

Payroll is a People module ([HR.md](HR.md)). Finance sees only **Payroll paid (total)** on the dashboard (paid / closed periods by pay date, `finance.records.all`); the Finance Manager approves and marks payroll paid from period totals without employee-level lines. Nothing is posted to a ledger. `UserCostRate` stays costing metadata — payroll never reads it as salary, and compensation never feeds project cost.

## Procurement (Phase 7) and finance

Purchase orders live in Operations ([OPERATIONS.md](OPERATIONS.md)). A PO never creates a payment, payable or ledger entry; a received PO is shown as "ready for supplier payment processing" and the supplier expense is recorded through the normal expense flow with `Expense.purchaseOrderId` (vendor and currency must match the PO, the PO must be issued). Historical expenses are never rewritten. Finance managers approve the executive procurement tier and purchase orders.

## Phase 8 boundary

Not built: general ledger, bank reconciliation, supplier payables / full accounting, NOVA internals.
