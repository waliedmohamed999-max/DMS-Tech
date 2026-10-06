import { NextResponse, type NextRequest } from "next/server";
import { getSession, requireCtx } from "@/lib/os/dal";
import { errorResponse, readUpload, sameOrigin } from "@/lib/os/upload";
import { addVersion } from "@/server/ops/documents";
import "@/server";
import { enforceLimit } from "@/server/security/limits";

/** New immutable version of an existing document (multipart). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  // a temporary password must be replaced before anything else is allowed (same rule as pages and actions)
  if (session.user.mustChangePassword) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  const ctx = await requireCtx();
  try {
    await enforceLimit("upload", ctx.userId);
  } catch (e) {
    return errorResponse(e);
  }
  const { id } = await params;
  const up = await readUpload(req);
  if ("error" in up) return NextResponse.json({ ok: false, error: up.error }, { status: 400 });
  try {
    const v = await addVersion(ctx, id, up.file, { note: up.fields.note ?? "" });
    return NextResponse.json({ ok: true, id, version: v.version });
  } catch (e) {
    return errorResponse(e);
  }
}
