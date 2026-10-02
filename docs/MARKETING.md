# Marketing operations (Phase 8)

Covers campaigns, audience, consent, WhatsApp sending, attribution and the marketing dashboard. Service code lives in `src/server/marketing/campaigns.ts`, `attribution.ts` and `src/server/whatsapp/service.ts`. UI is at `/app/marketing`.

Every figure shown is a count or sum of real rows. Nothing is estimated, and no figure is called "revenue".

## Campaign lifecycle

```
DRAFT ──submit──▶ READY ──start──▶ RUNNING ⇄ PAUSED ──▶ COMPLETED | FAILED
  │      └─ eligible > organization threshold → Approval CAMPAIGN (whatsapp.campaigns.approve)
  └──────────────────────────────── cancel (any open state) ──▶ CANCELLED
```

- **Numbering.** Campaigns are numbered `CMP-000001`. `utm_campaign` defaults to the lower-case number.
- **Versioning.** A change to the template, its parameters, the opt-in rule, the channel, the send rate or the audience **bumps `version`**:
  - a pending approval is withdrawn (cancelled);
  - a granted approval becomes **stale**: the status goes back to DRAFT and the old `approvedVersion` no longer matches, so the campaign cannot start.

  Name, objective, budget, dates and UTM fields never invalidate an approval.
- **Approval.** The approval payload snapshots version, template, parameters, eligible / estimated counts, skip reasons, opt-in rule and send rate.
  - The handler refuses a decision if the campaign is no longer at that version (`CAMPAIGN_APPROVAL_STALE`).
  - Requesters can't approve their own campaign.
  - The threshold is `Organization.campaignApprovalThreshold` (default 50, DB CHECK ≥ 0).
- **Start** (WhatsApp) requires:
  - READY status, with `approvedVersion = version`;
  - a CONNECTED or DEGRADED WhatsApp connection;
  - an APPROVED template;
  - at least one eligible recipient.

  If the audience has grown beyond the approved count and is now over the threshold, start is refused (`AUDIENCE_GREW_REAPPROVAL`).
- **Snapshot.** Start writes the recipient snapshot in the same transaction:
  - every matched person is recorded, and skipped ones keep their reason;
  - a single aggregated `campaign.recipient_skipped` audit entry records the counts.

  After start, DB triggers freeze the snapshot:
  - `campaign_recipient_guard` (`RECIPIENTS_IMMUTABLE`): no inserts once RUNNING or later, no deletes, identity fields fixed;
  - `campaign_freeze` (`CAMPAIGN_IMMUTABLE`): template, parameters, version, opt-in rule, channel and recipient count are fixed.
- **Sending** (worker `campaignTick`):
  - Each tick queues at most `sendRatePerMinute` recipients per rolling minute.
  - Consent is **re-checked at send time**: an opt-out after the snapshot wins (`OPTED_OUT_AFTER_SNAPSHOT`).
  - Each send is guarded by `CampaignMessage (campaign, recipient, version)`, a unique row, so repeated or concurrent ticks never send twice.
  - Outbox key: `campaign:{id}:{recipient}:{version}`.
  - Template parameters support `{{name}}`.
- **Failures.** A provider failure fails only that recipient (dead letter → recipient `FAILED`). The campaign completes with its real counts. It becomes `FAILED` only if no message at all was delivered.

  If the connection is down, nothing is queued and nothing fails: the campaign waits.
- **Pause** stops queueing; messages already handed to the outbox (at most one minute of the send rate) are still delivered.
- **Cancel** skips pending recipients (`CAMPAIGN_CANCELLED`). Messages already queued are dropped by the sender, not sent.
- **Non-WhatsApp channels** (Meta, Google, LinkedIn, TikTok, email, other) are **tracking-only**:
  - UTM attribution plus manual spend;
  - READY → RUNNING → COMPLETED by hand;
  - nothing is sent to ad platforms.

## Audience

The filter (`CampaignAudience.filter`) selects one of:
- **Leads**: source, status (default OPEN + QUALIFIED), interested service, city, open-opportunity stage. Uses the WhatsApp number, else the phone.
- **Clients** (default ACTIVE): primary contact phone, else the client phone; city, service, opportunity stage.

There is one row per normalized phone. A preview shows matched vs eligible counts and skip reasons. Phones are masked (last 4 digits) in samples and lists.

## Consent (`ContactConsent`)

Consent is an append-only history per (channel, address); a DB trigger enforces `CONSENT_IMMUTABLE`. The latest row wins.

| Status | Effect |
|---|---|
| `OPTED_IN` | Eligible |
| `OPTED_OUT` | Always skipped. Recorded from a STOP keyword or by hand |
| `BLOCKED` | Always skipped; replies are refused too |
| `UNKNOWN` (no row) | Skipped when the campaign requires opt-in (default) |

Re-enabling an opted-out or blocked number requires a recorded reason (`REOPT_IN_REASON_REQUIRED`). It is never silent. Every change is audited (`consent.changed`).

## Attribution (`AttributionTouch`)

- **FIRST touch.** Every lead has exactly one FIRST touch: a partial unique index plus an append-only trigger (`ATTRIBUTION_IMMUTABLE`).
  - It is written when the lead is created: website capture UTM, webhook `utm`, or WhatsApp.
  - The migration back-filled it for existing leads from Phase 2 capture metadata.
  - **The original acquisition source is never overwritten.**
- **TOUCH rows.** Later contacts append TOUCH rows: website resubmissions, or WhatsApp campaign replies when a lead is created. Last touch is the latest row.
- **Campaign link.** A touch is linked to a campaign only by an exact (case-insensitive) `utm_campaign` match or by an explicit WhatsApp campaign reply. There is no fuzzy or probabilistic attribution.
- **Funnel.** The funnel for a campaign follows only traceable chains:

  lead → qualified / converted → opportunity (`Opportunity.sourceLeadId`) → won → quotation / contract → **billed** = issued invoices (`ISSUED`, `SENT`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`) → **collected** = payment allocations of non-reversed payments.

  Billed and collected are separate figures. Both first-touch and last-touch models are shown.

## Spend

`CampaignSpend` rows have a `source`:
- `MANUAL`: entered by marketing, in the campaign currency, audited.
- `PROVIDER_SYNCED`: reserved for an ads API sync, which **does not exist in this build**; the UI says "not connected".

Cost per lead is shown only when manual spend and first-touch leads are both > 0.

## Dashboard (`/app/marketing`)

Period filter: 7 / 30 / 90 / 365 days. It shows:
- running campaigns;
- new leads by original source (first touch);
- WhatsApp messages received;
- opt-outs;
- conversations needing a match.

Per started campaign it shows sent / read / replied (WhatsApp only), and leads / billed / collected (needs `marketing.reports.view`) and manual spend.

## Permissions

| Key | Grants |
|---|---|
| `marketing.view` | Dashboard, campaigns |
| `marketing.manage` | Create / edit / run campaigns, spend, consent |
| `marketing.reports.view` | Attribution funnel, billed / collected |
| `whatsapp.campaigns.create` | Create / run WhatsApp campaigns |
| `whatsapp.campaigns.approve` | Decide CAMPAIGN approvals (plus `approvals.decide`) |

Roles:

| Role | Keys |
|---|---|
| Marketing | `marketing.*`, `whatsapp.view` / `send` / `campaigns.create` |
| Sales manager | `whatsapp.view` / `send` / `campaigns.approve`, `marketing.view` / `reports.view` |

Former key: `marketing.campaigns.manage` → `marketing.view` / `manage` / `reports.view` + `whatsapp.campaigns.create`.

## Notifications (category MARKETING)

- Campaign approved / completed / failed go to the creator. Failed also goes to marketing managers.
- An unmatched or ambiguous WhatsApp conversation goes to WhatsApp agents, once per conversation per day.

## Limitations

- No ads API (Meta / Google): spend is manual.
- No scheduled start: `SCHEDULED` is reserved.
- No email campaigns.
- No A/B variants.
- Attribution is deterministic (first / last touch), not multi-touch weighted.
