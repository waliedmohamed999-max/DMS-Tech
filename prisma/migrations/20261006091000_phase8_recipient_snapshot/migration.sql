-- Phase 8 follow-up: the recipient snapshot is taken in the same transaction that moves READY → RUNNING,
-- so once a campaign is RUNNING no recipient can be added either.
CREATE OR REPLACE FUNCTION campaign_recipient_guard() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  SELECT "status" INTO st FROM "MarketingCampaign" WHERE "id" = COALESCE(NEW."campaignId", OLD."campaignId");
  IF TG_OP = 'INSERT' THEN
    IF st IN ('RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED') THEN RAISE EXCEPTION 'RECIPIENTS_IMMUTABLE: recipients are snapshotted when the campaign starts'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF st IS NOT NULL THEN RAISE EXCEPTION 'RECIPIENTS_IMMUTABLE: snapshot rows cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF NEW."phone" IS DISTINCT FROM OLD."phone" OR NEW."leadId" IS DISTINCT FROM OLD."leadId" OR NEW."contactId" IS DISTINCT FROM OLD."contactId" OR NEW."clientId" IS DISTINCT FROM OLD."clientId" OR NEW."campaignId" IS DISTINCT FROM OLD."campaignId" THEN
    RAISE EXCEPTION 'RECIPIENTS_IMMUTABLE: recipient identity cannot change';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
