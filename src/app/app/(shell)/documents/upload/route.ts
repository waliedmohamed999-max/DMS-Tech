import { NextResponse, type NextRequest } from "next/server";
import { getSession, requireCtx } from "@/lib/os/dal";
import { errorResponse, readUpload, sameOrigin } from "@/lib/os/upload";
import { createDocument } from "@/server/ops/documents";
import "@/server";
import { enforceLimit } from "@/server/security/limits";

/** New document (multipart). Validation, storage and authorisation happen in the documents service. */
export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  const ctx = await requireCtx();
  try {
    await enforceLimit("upload", ctx.userId);
  } catch (e) {
    return errorResponse(e);
  }
  const up = await readUpload(req);
  if ("error" in up) return NextResponse.json({ ok: false, error: up.error }, { status: 400 });
  try {
    const d = await createDocument(ctx, { ...up.fields, tags: up.fields.tags ?? "" }, up.file);
    return NextResponse.json({ ok: true, id: d.id });
  } catch (e) {
    return errorResponse(e);
  }
}
