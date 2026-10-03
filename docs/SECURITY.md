# Security hardening review (Phase 9)

## Sessions (Phase 1 review — no architecture change)

| Control | Implementation | Verified by |
|---|---|---|
| Token | 256-bit random, stored only as sha256 (`Session.id`) | `auth.test.ts` |
| Cookie | `HttpOnly`; `Secure` + `__Host-dms_os` prefix in production (HTTPS, host-bound, path `/`); `SameSite=Lax`; expiry = server session expiry (`sessionCookieOptions`) | `system.test.ts` #26 |
| Expiry | absolute 12 h, sliding idle 2 h (server-side) | `auth.test.ts` |
| Revocation | logout, per-session revoke (/app/me), all other sessions on password change, user disable invalidates sessions | `auth.test.ts` |
| Lockout | 5 failed passwords → 15 min lock; unknown e-mails take the same time (dummy Argon2) | `auth.test.ts` |
| Login rate limit | 30 / 15 min per IP, 10 / 15 min per e-mail (DB-backed, multi-instance) | `auth.test.ts`, `system.test.ts` #27 |
| Temporary passwords | `mustChangePassword` blocks every action until changed; the production bootstrap admin password is temporary | `system.test.ts` #24 |

There is no `SESSION_SECRET`: tokens are not signed, they are random and looked up hashed in the database.

## Security headers

`security-headers.mjs` (used by `next.config.mjs`):

| Header | Value |
|---|---|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; font-src 'self' data:; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` (+ `'unsafe-eval'` / `ws:` in development only) |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` (production only — add `preload` only after a deliberate decision) |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | camera, microphone, geolocation, payment, usb, interest-cohort disabled |
| Cross-Origin-Opener-Policy | `same-origin` |

**Phase 10: nonce CSP for the Business OS.** `src/proxy.ts` generates a fresh nonce per request for `/app/*` and sends
`script-src 'self' 'nonce-<random>' 'strict-dynamic'` (built by `src/lib/os/csp.ts`; `'unsafe-eval'` in development
only). Next.js applies the nonce to its own scripts. This was verified in a browser on staging: no CSP violations, and
hydration and client navigation work. The static CSP above now covers **only the public website**. Its pages are
statically generated, so they cannot carry a per-request nonce and keep `'unsafe-inline'` for scripts (WARN
`csp_public_site` in go-live:check). The public site has no session and no forms besides the rate-limited lead form.
`upgrade-insecure-requests` was removed because TLS is enforced by HSTS and the edge redirect. PDF / download / payslip routes keep the baseline headers but not the page CSP — they send their own
`Content-Security-Policy: sandbox`, `nosniff`, `no-store`, so the browser PDF viewer keeps working.

## CSRF

- Server actions: Next.js rejects actions whose `Origin` does not match the host; no `serverActions.allowedOrigins`
  is configured (do not add one without a reverse-proxy reason).
- Route handlers that change state (document upload, new version) call `isSameOrigin` (`src/server/security/csrf.ts`):
  cross-site `Sec-Fetch-Site`, a foreign `Origin` or the opaque `null` origin are rejected.
- Session cookie is `SameSite=Lax` → not sent on cross-site POSTs.
- Public endpoints carry no session authority: the website lead form (rate limited, honeypot) and inbound webhooks
  (HMAC signature, replay window).
- Integration configuration, payments, payroll and approvals are server actions (covered by the first point).
- Phase 10 staging evidence ([STAGING.md](STAGING.md)): a real server action captured in the browser was replayed.
  Same origin → 200. `Origin: https://evil.example` and `Origin: null` → aborted by Next.js. A cross-origin upload
  → 403. After logout, replaying the old cookie lands on the login page.

## Rate limits

| Surface | Limit |
|---|---|
| Login | 30 / 15 min / IP · 10 / 15 min / e-mail |
| Public lead form | 5 / 10 min / IP |
| Inbound webhooks | 600 / min / connection (+ 256 KB body cap) |
| Document upload / new version | 30 / 10 min / user |
| Integration "test connection" | 10 / 10 min / user |
| Password change | 5 / 15 min / user (before and after verification) |
| Operator retries (events / rules) | 60 / 10 min / user |

All limits are DB-backed (`RateLimit`) and hold across instances; ordinary navigation is never limited.

## Secret rotation

| Secret | Procedure |
|---|---|
| Integration master key (`INTEGRATION_MASTER_KEY`) | `INTEGRATION_MASTER_KEY_OLD=<old> INTEGRATION_MASTER_KEY=<new> npm run secrets:rotate` (dry run) then `-- --apply`: all secrets are decrypted with the old key first (abort if any fails), re-encrypted in one transaction (`keyVersion + 1`, audited `integration.master_key_rotated`); then deploy the new key to every instance. Never just replace the key: stored secrets would become unreadable (the app then shows them as "missing" and connections NOT_CONFIGURED — nothing is silently "connected"). |
| Provider tokens (WhatsApp, Google, S3) | Rotate at the provider, paste the new value in `/app/integrations` (write-only), press Test. Or keep them as `env:NAME` and rotate in the secret manager. |
| Webhook signing secrets | Set a new secret in `/app/integrations`, update the sender; deliveries signed with the old secret are rejected from that moment (no dual-secret window in this build). |
| Session "secret" | None exists. To log everyone out: `UPDATE "Session" SET "revokedAt" = now() WHERE "revokedAt" IS NULL`. |
| Database password | Rotate in the database / secret manager, update `DATABASE_URL`, restart instances and the worker. |

## Production protection

- The demo seed and the development clean-up refuse `NODE_ENV=production` and require `ALLOW_DEMO_SEED=1`
  (`ALLOW_DEMO_SEED` in production is itself a critical configuration error).
- Bootstrap refuses `@dms.test` e-mails and the shared demo password in production; the first Super Admin is created
  only through `npm run os:bootstrap` with a strong password that must be changed at first sign-in; provisioning is
  audited (`system.bootstrap_admin_created`).
- Readiness fails in production while any active `@dms.test` account exists.
- Uploads (Phase 7): allow-list, magic bytes, size cap, private storage, re-authorisation on every download, hash check.
  Antivirus: none installed — versions stay `NOT_SCANNED`; `REQUIRE_SCAN_BEFORE_DOWNLOAD=true` blocks every non-CLEAN
  download (off by default; enabling it without a scanner blocks all downloads and is flagged by the config check).

## Known security limitations

- Public website CSP keeps `'unsafe-inline'` for scripts (static pages; `/app` uses a nonce since Phase 10).
- Terminating an employee does not disable their system account automatically (two-step offboarding; go-live:check
  warns about leftovers).
- No WAF / bot protection beyond rate limits and the honeypot.
- No antivirus scanner.
- Webhook secret rotation has no overlap window.

## Sensitive field encryption (Phase 10)

IBANs (`EmployeeBankAccount`) are encrypted at the application level in addition to database encryption at rest.

- **Algorithm:** AES-256-GCM using Node's `crypto` (no homemade crypto). A random 96-bit IV per value and a 128-bit
  auth tag. The AAD is `EmployeeBankAccount.iban:<employeeId>`, so ciphertext copied to another employee fails to decrypt.
- **Key:** `HR_FIELD_KEY` (32 bytes) is separate from `INTEGRATION_MASTER_KEY`, and config validation refuses equal keys.
  The key version is stored per row. Rotation uses `HR_FIELD_KEY_PREVIOUS` + `npm run hr:encrypt-iban -- --rotate --apply`.
- **Stored per row:** `ibanCiphertext`, `ibanIv`, `ibanTag`, `ibanKeyVersion`, and `ibanLast4` for masking. The plaintext
  `iban` column is null after migration.
- **Database guards:**
  - CHECK: a row has either a plaintext IBAN or a complete ciphertext.
  - The history trigger (`bank_history_guard`) allows only two in-place changes, and both must keep the same last4:
    plaintext → ciphertext (encryption), and a higher key version (rotation). Anything else is still append-only.
- **Reads:**
  - Generic employee payloads never contain the IBAN, only `•••• •••• •••• 1234`.
  - Decryption happens only in `revealBankAccount`, after the permission check, and the reveal is audited.
  - Decryption failures raise `FIELD_DECRYPTION_FAILED` and the value is never logged.
- **Migration:**
  - `npm run hr:encrypt-iban` is a dry run. With `-- --apply`, each row is encrypted, decrypted back and compared
    before the plaintext is cleared, inside one transaction.
  - Take a verified backup first (see the DEPLOYMENT-RUNBOOK rollback note).
- **If the key is lost:** encrypted IBANs cannot be recovered. Back up `HR_FIELD_KEY` in the secret manager,
  separately from database backups.
