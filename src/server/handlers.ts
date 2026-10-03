/**
 * Every module that registers an approval handler or an outbox handler, in one place (no "server-only", so scripts —
 * the worker, sweeps, backups — load exactly the same set as the app).
 */
import "./admin/users"; // registers the ROLE_GRANT approval handler
import "./commercial/quotations"; // registers the QUOTATION approval handler
import "./projects/time"; // registers the TIMESHEET approval handler
import "./finance/expenses"; // registers the EXPENSE approval handler
import "./hr/leave"; // LEAVE
import "./hr/payroll"; // PAYROLL
import "./hr/recruitment"; // OFFER
import "./ops/procurement"; // PROCUREMENT
import "./ops/orders"; // PURCHASE_ORDER
import "./marketing/campaigns"; // CAMPAIGN
import "./integrations/worker"; // outbox handlers (whatsapp.send, custom.deliver)

import "./zatca/service"; // outbox handler zatca.submit (Phase 11)
