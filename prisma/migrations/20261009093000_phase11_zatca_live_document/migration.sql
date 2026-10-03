-- Phase 11 (P11-F): race-proof "one live compliance document per invoice" (the trigger check alone is not atomic
-- under concurrent inserts; the unique partial index is).
CREATE UNIQUE INDEX "ZatcaDocument_one_live_per_invoice" ON "ZatcaDocument" ("invoiceId") WHERE "status" <> 'REJECTED';
