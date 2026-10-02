import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { isAppError } from "@/server/errors";
import { isSameOrigin } from "@/server/security/csrf";
import { apiErrorBody } from "@/server/obs/errors";
import { MAX_DOCUMENT_BYTES, type UploadedFileLike } from "./upload-types";

/**
 * Shared plumbing for the multipart document routes. Route handlers (unlike server actions) get no built-in
 * CSRF origin check, so the Origin / Sec-Fetch-Site headers are verified here; the session cookie is also SameSite.
 */
export const sameOrigin = (req: NextRequest) => isSameOrigin(req.headers);

export async function readUpload(req: NextRequest): Promise<{ file: UploadedFileLike; fields: Record<string, string> } | { error: string }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_DOCUMENT_BYTES + 64 * 1024) return { error: "FILE_TOO_LARGE" };
  const fd = await req.formData().catch(() => null);
  if (!fd) return { error: "VALIDATION" };
  const f = fd.get("file");
  if (!f || typeof f === "string") return { error: "FILE_REQUIRED" };
  if (f.size > MAX_DOCUMENT_BYTES) return { error: "FILE_TOO_LARGE" };
  const fields: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k !== "file" && typeof v === "string") fields[k] = v;
  return { file: { name: f.name, type: f.type, data: Buffer.from(await f.arrayBuffer()) }, fields };
}

export function errorResponse(e: unknown) {
  if (e instanceof ZodError) return NextResponse.json({ ok: false, error: "VALIDATION", detail: e.issues[0]?.path.join(".") }, { status: 400 });
  if (isAppError(e)) {
    const m = /^([A-Z][A-Z0-9_]+)(?::(.*))?$/.exec(e.message);
    const status = e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : e.code === "CONFLICT" ? 409 : e.code === "RATE_LIMITED" ? 429 : 400;
    return NextResponse.json({ ok: false, error: m ? m[1] : e.code, detail: m?.[2] }, { status });
  }
  // unexpected: logged + reported, the client gets a category and a reference only
  const r = apiErrorBody(e, "documents_route");
  return NextResponse.json({ ok: false, error: r.body.code === "DEPENDENCY_UNAVAILABLE" ? "DEPENDENCY_UNAVAILABLE" : "UNKNOWN", ref: r.body.ref }, { status: r.status });
}
