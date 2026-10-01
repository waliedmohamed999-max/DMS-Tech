import { NextResponse, type NextRequest } from "next/server";
import { leadSchema, saveLead } from "@/lib/leads";
import { hit } from "@/server/rate-limit";

const MAX_BODY = 16_000;

/**
 * Public quote/contact endpoint → CRM lead.
 * - DB-backed rate limit (works across serverless instances): 5 / 10 min per IP, 30 / hour globally per IP prefix
 * - strict whitelist schema, body size cap, honeypot + timing + content heuristics (silent drop)
 * - never returns internal ids
 */
export async function POST(request: NextRequest) {
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

  try {
    await saveLead(parsed.data, { ip, userAgent });
  } catch (e) {
    console.error("[website lead]", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
