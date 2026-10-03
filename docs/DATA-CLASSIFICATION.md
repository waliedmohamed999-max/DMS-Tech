# Data classification & retention (Phase 9)

## Classes

| Class | Meaning | Handling |
|---|---|---|
| SECRET | credentials | encrypted or env-referenced; never displayed after save, never logged / audited |
| RESTRICTED | personal payroll / bank / identity data | permission-gated (`hr.compensation.*`, `hr.bank.*`), masked by default, reveal audited, never logged |
| CONFIDENTIAL | client, commercial and financial records | record-level scope (owner / team / all), audited changes |
| INTERNAL | operational data | organization members by permission |

## Inventory

| Data | Where | Class | Access / protection |
|---|---|---|---|
| Passwords | `User.passwordHash` (Argon2id) | SECRET | never readable |
| Session tokens | `Session.id` = sha256(token) | SECRET | cookie HttpOnly / Secure |
| Integration secrets | `IntegrationSecret` (AES-256-GCM, `INTEGRATION_MASTER_KEY`) or `env:` refs | SECRET | write-only UI, redacted everywhere |
| Webhook signing secrets, provider tokens | as above | SECRET | as above |
| Employee compensation | `EmployeeCompensation`, `PayrollEntry`, `PayrollAdjustment` | RESTRICTED | `hr.compensation.view`, payroll permissions; payslips per employee |
| Bank details (IBAN) | `EmployeeBankAccount.ibanCiphertext` (AES-256-GCM, `HR_FIELD_KEY`; Phase 10, plaintext column cleared) + `ibanLast4` | RESTRICTED | `hr.bank.*`, masked in UI / audit, decrypted only on audited reveal (`bank.revealed`) — see SECURITY.md#sensitive-field-encryption-phase-10 |
| Employee personal data | `Employee` (personal e-mail / phone, nationality, emergency contact, dates) | RESTRICTED | `hr.employees.sensitive`, department / manager scope |
| Leave / attendance | `LeaveRequest`, `AttendanceRecord` | RESTRICTED | self, manager chain, HR |
| Candidates | `Candidate`, `Application`, `Offer` | RESTRICTED | `hr.recruitment.*` |
| Client contacts | `Contact`, `Client`, `Lead` (names, phones, e-mails) | CONFIDENTIAL | CRM scope |
| WhatsApp conversations | `WhatsAppConversation`, `WhatsAppMessage` | CONFIDENTIAL | `whatsapp.view` |
| Consent | `ContactConsent` (append-only) | CONFIDENTIAL | marketing / WhatsApp managers |
| Documents | `Document`, `DocumentVersion` + files in private storage | per document classification (PUBLIC_INTERNAL → RESTRICTED) | record-inherited access, hash-verified download |
| Invoices, payments, quotations, contracts | finance / commercial tables | CONFIDENTIAL | finance / sales permissions, frozen once issued |
| Audit log | `AuditLog` (DB-protected append-only) | CONFIDENTIAL (may reference restricted changes, values masked where sensitive) | `admin.audit.view` |
| Backups | `BACKUP_DIR` / provider snapshots | contains ALL classes | encrypted storage, restricted access (see DISASTER-RECOVERY.md) |
| Logs | platform log collector | INTERNAL (redacted) | central redaction — no SECRET / RESTRICTED values |

## Retention

Operational / transient data only (`src/server/system/retention.ts`, daily via the worker, `npm run retention:purge`
for a dry run, `-- --apply` to delete). Override any default with `RETENTION_<KEY>_DAYS` (never below the minimum).

| Key | Data | Default | Minimum |
|---|---|---|---|
| SESSIONS | expired / revoked sessions | 30 d | 1 d |
| RATE_LIMITS | rate-limit windows | 2 d | 1 d |
| JOB_LEASES | expired job leases | 7 d | 1 d |
| INTEGRATION_LOGS | successful integration executions | 90 d | 30 d |
| INTEGRATION_FAILURES | failed integration executions | 180 d | 60 d |
| WEBHOOK_METADATA | processed / ignored / rejected webhook metadata | 90 d | 30 d |
| OUTBOX_DONE | delivered / dismissed outbox rows | 90 d | 30 d |
| NOTIFICATIONS | read notifications | 180 d | 30 d |
| DOMAIN_EVENTS | processed / dismissed events | 180 d | 60 d |
| AUTOMATION_EXECUTIONS | succeeded / skipped / dismissed executions | 180 d | 60 d |

**Never purged automatically** (no code path exists): audit log, invoices, payments and allocations, quotations,
contracts, payroll, payslips, compensation and bank history, employees, leave, attendance, documents and every
version, expenses, purchase orders and receipts, consent history, attribution, campaign recipient snapshots, backup
records, and any failed / dead-letter item until an operator resolves it. A legal retention policy (e.g. statutory
periods for accounting / HR records) is a separate, explicit future change. Temporary upload files: none — uploads
are processed in memory and written once to storage.
