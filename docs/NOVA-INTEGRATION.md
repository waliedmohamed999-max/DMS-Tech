# NOVA AI — External System Integration

**NOVA AI is a separate, existing DMS Tech platform. It is not part of the Business OS codebase and is not built here.**
The Business OS treats NOVA as an integrated external product: it links to it, records who launched it, and — only once NOVA publishes an API/webhook specification — may consume selected NOVA data.

## System boundary

| DMS Business OS owns | NOVA AI owns |
|---|---|
| CRM, sales, clients, quotations, contracts | AI agents |
| Projects, finance, HR, operations | AI orchestration and execution |
| Approvals, audit, company management | AI workflows and AI-specific automation |
| Deterministic (non-AI) business rules (planned, Phase 9) | AI-specific integrations and all AI platform functionality |

Not implemented in the Business OS, by design: AI agent orchestration, AI conversations, AI action execution, AI tool systems, prompt engines, LLM infrastructure, or any NOVA workflow that duplicates the external platform. NOVA remains the source of truth for NOVA operations; the Business OS would store only references or synchronized snapshots when a concrete need exists.

## What exists today

| Piece | Where | Behaviour |
|---|---|---|
| Adapter | `src/server/integrations/nova.ts` | `novaStatus()` reads config; `launchNova(ctx)` checks `nova.use`, writes audit `integration.nova_launched`, returns the URL. `NovaApiAdapter` is an **interface only** (no implementation, no fake responses). |
| Launch route | `GET /app/nova/launch` | Session + password-change gate + `nova.use` → audit → `302` to NOVA (`Referrer-Policy: no-referrer`). Not configured → back to `/app/nova`. |
| Status page | `/app/nova` | Connection status, platform URL, access method, SSO (not available), data API (not available), last sync (none), system boundary; configuration hint for `admin.integrations.manage` holders. |
| Sidebar | Services → **NOVA AI** | Live link to `/app/nova`. |
| Topbar | **Open NOVA** | Opens the external platform in a new tab via the launch route (or the status page when not configured). |
| Command Center | NOVA AI card | Launch button / configuration status. No AI-generated content. |
| Public website | `/nova-ai` | Marketing page for the NOVA product (unchanged). |

Permission: `nova.use` — granted to every system role (it only gates the link; NOVA's own login decides access to NOVA). Configuration display: `admin.integrations.manage`.

## Configuration

```
NOVA_URL=https://nova.example.com     # https only (http://localhost allowed outside production)
```
Server-side env, read at request time; restart after changing. Invalid values (non-https, `javascript:`, malformed) are rejected and the UI says so.

## Access model

Preferred, in order — only the last two need nothing from NOVA:
1. SSO / federated login (needs NOVA to support an IdP/OIDC flow)
2. Signed launch URL (needs a shared signing scheme from NOVA)
3. OAuth / token handoff
4. NOVA's normal login page
5. Plain external link — **current implementation**

Rules: NOVA passwords are never stored or proxied; no browser automation to log users into NOVA. Upgrading the access model changes only `launchNova()` — the UI and route stay the same.

## Future data exchange (not implemented)

Implemented only when NOVA provides an actual API/webhook specification (auth scheme, payload schema, signing, retries):

- Business OS → NOVA: `lead.created`, `client.created`, `quotation.accepted`, `project.created` (would subscribe to existing domain events in `src/server/events/subscribers.ts` and call `NovaApiAdapter.publish`).
- NOVA → Business OS: `nova.lead_generated`, `nova.action_completed`, `nova.campaign_completed`, `nova.execution_failed` (would arrive at a signed webhook endpoint via `NovaApiAdapter.parseWebhook`; e.g. `nova.lead_generated` would create a CRM lead through the existing lead service with source tracking).
- Possible read-only data: automation/campaign status, agent activity, usage, execution results and errors.

At that point `/app/nova` would show real health checks and the last successful sync; until then those fields show "not available / none".
