import { NextResponse, type NextRequest } from "next/server";
import { leadSchema, saveLead } from "@/lib/leads";
import { hit } from "@/server/rate-limit";
import { randomUUID } from "node:crypto";
import { runWithObs } from "@/server/obs/context";
import { reportError } from "@/server/obs/errors";
import { spamReason } from "@/server/crm/website";
import { emailWebsiteLead } from "@/server/notify/lead-mail";

const MAX_BODY = 16_000;

/**
 * Public quote/contact endpoint → CRM lead.
 * - DB-backed rate limit (works across serverless instances): 5 / 10 min per IP, 30 / hour globally per IP prefix
 * - strict whitelist schema, body size cap, honeypot + timing + content heuristics (silent drop)
 * - never returns internal ids
 * - every non-spam request is also e-mailed to the company inbox (src/server/notify/lead-mail.ts); the visitor sees
 *   success when either the CRM save or the e-mail worked, so a request is never lost to one failing side
 */
export async function POST(request: NextRequest) {
  // Phase 10: request id → lead.created event → automation → outbox share one correlation id
  const rid = request.headers.get("x-request-id");
  const requestId = rid && /^[A-Za-z0-9-]{8,64}$/.test(rid) ? rid : randomUUID();
  const res = await runWithObs({ requestId, correlationId: requestId, module: "public", operation: "website_lead" }, () => handle(request));
  res.headers.set("x-request-id", requestId);
  return res;
}

async function handle(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
  const userAgent = request.headers.get("user-agent");

  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });

  if (!(await hit(`web-lead:ip:${ip}`, 5, 10 * 60 * 1000))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    // filled honeypot looks like success to bots
    if (body && typeof body === "object" && "website" in body && (body as { website?: string }).website) return NextResponse.json({ ok: true });
    return NextResponse.json({ ok: false, error: "invalid", issues: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 422 });
  }

  let saved = false;
  let leadNumber: string | undefined;
  try {
    const r = await saveLead(parsed.data, { ip, userAgent });
    saved = true;
    leadNumber = r.leadNumber;
  } catch (e) {
    reportError(e, "website_lead");
  }

  // spam is dropped silently (the CRM side audits it); everything else goes to the inbox too
  if (spamReason(parsed.data)) return NextResponse.json({ ok: true });
  let mailed = false;
  try {
    mailed = (await emailWebsiteLead(parsed.data, { ip, leadNumber, saved })) === "sent";
  } catch (e) {
    reportError(e, "website_lead_email");
  }

  if (!saved && !mailed) return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
