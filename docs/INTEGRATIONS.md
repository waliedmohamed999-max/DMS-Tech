# Integrations, webhooks & WhatsApp (Phase 8)

The OS connects to external systems through **one registry, one secret store, one inbound webhook endpoint and one transactional outbox**.
Nothing is simulated: a provider is `CONNECTED` only after a real health check succeeds. Without credentials it stays `NOT_CONFIGURED`.

Marketing campaigns, consent and attribution are documented in [MARKETING.md](MARKETING.md).

## Registry (`src/server/integrations/registry.ts`, `/app/integrations`)

`IntegrationConnection` has one row per provider (name `default`). Bootstrap provisions these rows (`ensureRegistry`).

| Status | Meaning |
|---|---|
| `NOT_CONFIGURED` | Required settings or secrets are missing, or the provider has no adapter |
| `CONFIGURED` | Everything is entered but never verified, or settings changed since the last check |
| `CONNECTED` | The last real health check against the provider succeeded |
| `DEGRADED` | The provider is reachable but reports a degraded state (e.g. WhatsApp quality RED) |
| `ERROR` | The last check or call failed (e.g. an `AUTH_FAILED` from the outbox) |
| `DISABLED` | An admin switched it off (`disabledAt` is required — DB CHECK) |

A URL or token being present **never** yields `CONNECTED`.

| Provider | Adapter | What "connected" means |
|---|---|---|
| WHATSAPP | live | `GET /{phone-number-id}` on the Graph API succeeds with the stored token |
| WEBHOOK (inbound) | live | The first **verified signed delivery** has been received |
| CUSTOM (outbound webhook) | live | A signed `ping` POST is accepted (2xx) by the endpoint |
| S3 | live | `HEAD bucket` succeeds (SigV4) |
| GOOGLE / GMAIL / CALENDAR / DRIVE | boundary | OAuth refresh + profile call succeeds. Business features are later work |
| META / GOOGLE_ADS | manual | Never connected. Spend and results are entered manually and labelled manual |
| ZID / SALLA / SHOPIFY | unsupported | `CommerceAdapter` interface only. They stay `NOT_CONFIGURED` |
| NOVA | external | Never connected. URL configuration only (see [NOVA-INTEGRATION.md](NOVA-INTEGRATION.md)) |

Actions:
- `configure` needs `integrations.manage`. It is not available for unsupported or external providers.
- `test` needs `integrations.test`. The provider call runs **outside** any DB transaction.
- `disable` / `enable` needs `integrations.manage`.

Every action is audited. Audit rows record **names only**: changed secret names, config keys, and the status before and after.

### Sandbox

A connection can be `SANDBOX`. Only a SANDBOX connection may point the WhatsApp adapter at a non-official API base (a local Graph-compatible test server). This is refused when `NODE_ENV=production`, and configuring SANDBOX at all is refused in production. The UI labels sandbox connections.

## Secrets (`src/server/integrations/secrets.ts`)

- Values are encrypted with **AES-256-GCM**. The key comes from `INTEGRATION_MASTER_KEY` (base64, 32 bytes) plus a key version, and the result is stored in `IntegrationSecret`. The connection keeps only references in `secretRefs`: `enc:<id>` or `env:VAR_NAME`.
- `env:VAR_NAME` lets production keep secrets in the platform secret manager; the OS stores only the reference.
- Without a master key, plain values are refused (`SECRET_STORE_NOT_CONFIGURED`); `env:` references still work.
- Secret fields are write-only in the UI:
  - they render as password inputs that are always empty;
  - an empty value keeps the stored secret;
  - the list view shows a state only: `stored`, `from environment`, `environment variable missing` or `missing`.
- Secrets are never returned by a generic API, rendered after save, logged, or included in audit before/after snapshots. Provider errors pass through `sanitizeError`, which strips:
  - bearer tokens and `access_token=` / `token=` pairs;
  - Meta `EAA…` tokens and Google `ya29.` tokens;
  - the known secret values themselves.

  Errors are capped at 500 characters.

## Inbound webhooks (`src/server/integrations/webhooks.ts`)

Endpoint: `GET|POST /api/integrations/webhooks/{connectionId}`. It is public, and authenticity comes from the signature.

Each POST goes through these steps, in order:

1. Size cap of 256 KB (413).
2. Rate limit of 600 requests per minute per connection (429).
3. The connection must exist and not be disabled (404 / 403).
4. **Signature check**, in constant time:
   - **WhatsApp**: `X-Hub-Signature-256: sha256=HMAC(appSecret, raw body)`.
   - **Generic WEBHOOK**: `X-DMS-Signature: t=<unix>,v1=hex(HMAC(secret, "<t>." + body))`. Timestamp tolerance is ±300 s (replay window).

   A failure is stored as `REJECTED` (with a synthetic id, so a forged request can never claim a real event id), audited as `webhook.rejected`, and answered with 401.
5. JSON and zod schema validation (400, `REJECTED`).
6. **Dedupe** on `(organization, provider, externalEventId)` under a transaction advisory lock.
   - The external event id is `X-DMS-Delivery` (or the body `id`) when the sender provides one. Otherwise it is `sha256(raw body)`; WhatsApp sends no delivery id, and an identical body is the same delivery.
   - A duplicate of a `PROCESSED` or `IGNORED` event only increments `duplicateCount` and is audited as `webhook.replayed`.
   - A `FAILED` or `REJECTED` event is processed again.
7. Processing runs in the **same transaction** as the event row. The result is `PROCESSED` / `IGNORED` and is audited as `webhook.received`.
   - On an exception, a transient error is recorded `FAILED` and answered 500 (the provider retries).
   - A validation or conflict error is recorded `REJECTED` and answered 422 (no retry).

Raw bodies and headers are never stored, only a payload hash and sanitized metadata (counts and ids).

Supported generic events:
- `lead.created`: creates a lead with a FIRST attribution touch built from `data.utm`.
- Other events are `IGNORED`.
- `allowedEvents` in the connection config can narrow the list further.

The WhatsApp GET handshake answers `hub.challenge` only when `hub.verify_token` equals the stored verify token (constant-time compare).

## Outbound: transactional outbox (`src/server/integrations/outbox.ts`)

```
business transaction ─ enqueue(tx, …, idempotencyKey) ─ commit
worker ─ claim (UPDATE … FOR UPDATE SKIP LOCKED, lockedAt/lockedBy, attempts+1)
       ─ handler calls the provider OUTSIDE any transaction
       ─ SUCCEEDED | FAILED (nextAttemptAt = now + min(1h, 30s·2^(n-1))) | DEAD_LETTER
```

- **Idempotency.** The key `(organization, idempotencyKey)` is unique. Enqueueing the same key twice returns the existing row.
- **Handlers** are themselves idempotent. For example, `whatsapp.send` returns early if the message already has a provider id.
- **Dead letter.** A row goes to the dead letter when:
  - the error is non-retryable (4xx `PROVIDER_REJECTED`, `AUTH_FAILED`, config errors); or
  - attempts reach `maxAttempts` (default 6).

  `AUTH_FAILED` also marks the connection `ERROR`. A dead letter emits `integration.dead_letter`, which sends a notification deduped per provider per day.
- **Crashed workers.** Rows locked for more than 10 minutes are released.
- **Operators.** Operators with `integrations.manage` can **retry** (back to PENDING, attempts reset) or **dismiss** (with a reason) FAILED and DEAD_LETTER rows. Both are audited.
- **A provider failure never rolls back the business transaction that queued the work.** A WhatsApp reply stays `QUEUED`, then becomes `SENT` or `FAILED`.

Outbound CUSTOM webhooks are created by a `*` subscriber:
- The event types are listed in `OUTBOUND_EVENTS`: lead / client / opportunity / quotation / invoice / payment / ticket / project / campaign milestones.
- A CONNECTED CUSTOM connection receives an event when its `events` config includes it.
- Each event becomes one outbox row with key `custom:{connection}:{domainEventId}`, so a re-dispatch never delivers twice.
- Only whitelisted keys are sent (ids, numbers, amounts, status), never notes or personal text.
- The body is `{id, event, occurredAt, data}`, signed with the same `X-DMS-Signature` scheme. Receivers can verify it with `signPayload`.

## Logs (`/app/integrations/logs`, `integrations.logs.view`)

Views: failed calls, queued/retrying, dead letters, webhooks, succeeded.

- `IntegrationExecution` stores the provider, direction, action, status, error code, **sanitized** error, external reference and attempt number.
- Outbox payloads are shown as **key names only**.
- Webhook events show the signature result and the duplicate count.

## WhatsApp Business Platform (`src/server/whatsapp/service.ts`, `/app/whatsapp`)

**Only the official Cloud API.** There is no personal-WhatsApp automation, no QR login and no stored passwords.

- **Inbound** (webhook):
  - Messages are stored once (unique `providerMessageId` per organization). A conversation is created per normalized `waId`.
  - Status receipts (sent → delivered → read, or failed) only move forward.
  - Template status updates change the template row.
- **Matching**:
  - Exactly one distinct CRM person (contact, client or non-archived lead; a lead converted into the matched client counts as the same person) → `MATCHED` and linked.
  - Several → `AMBIGUOUS` with candidates. **Nothing is merged.**
  - None → `UNMATCHED`.
  - Candidates are shown only to users who can see that record type.
- **Opt-out keywords** (`STOP`, `UNSUBSCRIBE`, `إلغاء`, `إيقاف`, `توقف` …) append an `OPTED_OUT` consent row.
- **Explicit operator actions** (all audited):
  - **link** to one visible lead, contact or client;
  - **create lead** (source WHATSAPP; attributed to a campaign if the number replied to one);
  - **create ticket** (once; the last inbound messages are copied in);
  - **add CRM note**.

  Tickets and leads are **never created automatically**.
- **Replies**:
  - Free text is allowed only inside the 24-hour customer window; otherwise an **APPROVED** template is required.
  - Blocked numbers are refused.
  - Every reply is queued through the outbox (`whatsapp.send`).
  - Nothing is sent unless the connection is CONNECTED or DEGRADED.
- **Templates** are synced from the provider (`whatsapp.manage`). A template is never marked approved locally.
- **Media** is recorded as metadata only (media id and mime type). Media is never downloaded or exposed publicly.

## Worker (`npm run integrations:worker`, `src/server/integrations/worker.ts`)

Each tick runs three steps, and each step has its own lease:
1. campaign batches;
2. outbox delivery;
3. health re-checks of live connections every 30 minutes, plus a credential-expiry warning 7 days ahead (deduped per credential).

Run it every minute from a scheduler, or `npm run integrations:worker -- --loop` as a long-running process. The WhatsApp and Marketing pages also trigger a throttled tick, at most once a minute per organization, as a fallback.

## Permissions

| Key | Grants |
|---|---|
| `integrations.view` | Registry page (redacted) |
| `integrations.manage` | Configure, enable / disable, retry / dismiss outbox |
| `integrations.test` | Run a connection health check |
| `integrations.logs.view` | Logs (sanitized) |
| `whatsapp.view` | Inbox, conversations, templates |
| `whatsapp.send` | Replies, link conversations |
| `whatsapp.manage` | Template sync, consent records |

Renamed from the earlier placeholders (`migrateLegacyPermissions`):
- `admin.integrations.manage` → `integrations.*`
- `marketing.whatsapp.send` → `whatsapp.view` + `whatsapp.send`

The CEO role has every key except `integrations.manage`. Super Admin manages integrations.

## Known limitations

- Google adapters cover OAuth plus health and Gmail send only. There is no OAuth consent flow UI: refresh tokens are entered as secrets.
- No media download. No outbound email channel for campaigns.
- Commerce providers (Zid, Salla, Shopify) are interface-only.
- The webhook rate limit is per connection, not per source IP.
