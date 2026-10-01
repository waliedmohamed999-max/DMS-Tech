import "server-only";
import "@/server"; // registers event subscribers (notifications for new website leads)
import { captureWebsiteLead, websiteLeadSchema, type CaptureResult } from "@/server/crm/website";

/**
 * Public website lead intake. Every valid submission becomes a CRM Lead
 * (source WEBSITE) through the Business OS service layer; see src/server/crm/website.ts.
 */
export const leadSchema = websiteLeadSchema;

export function saveLead(raw: unknown, meta: { ip?: string | null; userAgent?: string | null }): Promise<CaptureResult> {
  return captureWebsiteLead(raw, meta);
}
