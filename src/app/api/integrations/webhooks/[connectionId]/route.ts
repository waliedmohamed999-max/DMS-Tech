import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { runWithObs } from "@/server/obs/context";
import { reportError } from "@/server/obs/errors";
import { MAX_WEBHOOK_BYTES, receiveWebhook, verifySubscription, type WebhookResult } from "@/server/integrations/webhooks";

/**
 * Public inbound webhook endpoint (no session — authenticity comes from the provider signature).
 * GET  = WhatsApp subscription verification; POST = signed event delivery.
 * Responses never echo internal ids, payloads or reasons beyond a short code.
 */
export const dynamic = "force-dynamic";

const send = (r: WebhookResult) => (typeof r.body === "string" ? new NextResponse(r.body, { status: r.status, headers: { "content-type": "text/plain" } }) : NextResponse.json(r.body, { status: r.status }));

export async function GET(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  return send(await verifySubscription(connectionId, request.nextUrl.searchParams));
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ connectionId: string }> }) {
  const requestId = randomUUID();
  const res = await runWithObs({ requestId, correlationId: requestId, module: "webhook" }, () => handlePost(request, ctx));
  res.headers.set("x-request-id", requestId);
  return res;
}

async function handlePost(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_WEBHOOK_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const raw = Buffer.from(await request.arrayBuffer());
  try {
    return send(await receiveWebhook(connectionId, raw, request.headers));
  } catch (e) {
    reportError(e, "webhook_route");
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
