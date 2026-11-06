import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import "@/server";
import { hitOrLocal } from "@/server/rate-limit";
import { runWithObs } from "@/server/obs/context";
import { reportError } from "@/server/obs/errors";
import { applicationSchema, applicationSpam, captureJobApplication, CV_MAX_BYTES, cvProblem } from "@/server/hr/careers-intake";
import { emailJobApplication } from "@/server/notify/careers-mail";
import type { UploadedFile } from "@/server/ops/documents";
import { cappedFormData } from "@/lib/capped-body";

/** A whole request: the CV (5 MB) plus the form fields. */
const MAX_BODY = CV_MAX_BYTES + 64 * 1024;

const ipPrefix = (ip: string) => (ip.includes(":") ? ip.split(":").slice(0, 3).join(":") : ip.split(".").slice(0, 3).join("."));

/**
 * Public job application (multipart/form-data) → recruitment candidate + application + CV, and an e-mail to the
 * company inbox with the CV attached.
 * - rate limit: 3 / 10 min per IP, 15 / hour per IP prefix (DB-backed; works while the DB is down)
 * - whitelist schema, size cap, CV type / size / content checks, honeypot + timing (silent drop)
 * - never returns internal ids; the visitor sees success when either the dashboard save or the e-mail worked
 */
export async function POST(request: NextRequest) {
  const rid = request.headers.get("x-request-id");
  const requestId = rid && /^[A-Za-z0-9-]{8,64}$/.test(rid) ? rid : randomUUID();
  const res = await runWithObs({ requestId, correlationId: requestId, module: "public", operation: "job_application" }, () => handle(request));
  res.headers.set("x-request-id", requestId);
  return res;
}

async function handle(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
  const userAgent = request.headers.get("user-agent");
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  if (!(await hitOrLocal(`web-apply:ip:${ip}`, 3, 10 * 60 * 1000)) || !(await hitOrLocal(`web-apply:net:${ipPrefix(ip)}`, 15, 60 * 60 * 1000))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const form = await cappedFormData(request, MAX_BODY);
  if (form === "too_large") return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  if (form === "bad_form") return NextResponse.json({ ok: false, error: "bad_form" }, { status: 400 });
  const fields: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
  const parsed = applicationSchema.safeParse(fields);
  if (!parsed.success) {
    if (fields.website) return NextResponse.json({ ok: true }); // a filled honeypot looks like success to bots
    return NextResponse.json({ ok: false, error: "invalid", issues: parsed.error.issues.map((i) => String(i.path[0] ?? "")) }, { status: 422 });
  }

  const blob = form.get("cv");
  let file: UploadedFile | null = null;
  if (blob && typeof blob !== "string" && blob.size > 0) {
    if (blob.size > CV_MAX_BYTES) return NextResponse.json({ ok: false, error: "invalid", issues: ["cv"], cv: "CV_TOO_LARGE" }, { status: 422 });
    file = { name: blob.name || "cv", type: blob.type || "", data: Buffer.from(await blob.arrayBuffer()) };
  }
  const bad = cvProblem(file);
  if (bad) return NextResponse.json({ ok: false, error: "invalid", issues: ["cv"], cv: bad }, { status: 422 });
  // a CV is required for an application (the form asks for it); the e-mail fallback still carries everything else
  if (!file) return NextResponse.json({ ok: false, error: "invalid", issues: ["cv"], cv: "CV_REQUIRED" }, { status: 422 });

  let saved = false;
  let candidateNumber: string | undefined;
  let repeat = false;
  try {
    const r = await captureJobApplication(parsed.data, file, { ip, userAgent });
    if (r.outcome === "spam") return NextResponse.json({ ok: true });
    saved = true;
    candidateNumber = r.candidateNumber;
    repeat = r.outcome === "appended";
  } catch (e) {
    // a CV refused by the storage checks (content not matching its type, malware) is the visitor's to fix
    const code = (e as Error)?.message ?? "";
    if (/^(FILE_[A-Z_]+)$/.test(code)) return NextResponse.json({ ok: false, error: "invalid", issues: ["cv"], cv: code }, { status: 422 });
    reportError(e, "job_application");
  }
  if (applicationSpam(parsed.data)) return NextResponse.json({ ok: true });

  let mailed = false;
  try {
    mailed = (await emailJobApplication(parsed.data, file, { ip, candidateNumber, saved, repeat })) === "sent";
  } catch (e) {
    reportError(e, "job_application_email");
  }
  if (!saved && !mailed) return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
