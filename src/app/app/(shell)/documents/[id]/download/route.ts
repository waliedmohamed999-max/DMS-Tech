import { NextResponse, type NextRequest } from "next/server";
import { getSession, requireCtx } from "@/lib/os/dal";
import { downloadDocument } from "@/server/ops/documents";
import { INLINE_TYPES } from "@/server/ops/storage";
import { isAppError } from "@/server/errors";
import "@/server";

/**
 * Authorised file download. There is no public URL for any stored file: this route re-checks the session,
 * the linked record's permissions and the classification on every request, verifies the stored SHA-256,
 * and serves with nosniff + a sandbox CSP. `?v=N` selects a version, `?inline=1` previews PDFs / images.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/app/login", req.url));
  // a temporary password must be replaced before anything else is allowed (same rule as pages and actions)
  if (session.user.mustChangePassword) return NextResponse.redirect(new URL("/app/me?force=1", req.url));
  const ctx = await requireCtx();
  const { id } = await params;
  const v = Number(req.nextUrl.searchParams.get("v") ?? "") || undefined;
  try {
    const f = await downloadDocument(ctx, id, v);
    const inline = req.nextUrl.searchParams.get("inline") === "1" && INLINE_TYPES.has(f.mime);
    const ascii = f.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
    return new NextResponse(new Uint8Array(f.data), {
      headers: {
        "Content-Type": f.mime,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "Content-Length": String(f.data.length),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
        "Cache-Control": "private, no-store",
        "X-Content-SHA256": f.sha256
      }
    });
  } catch (e) {
    if (isAppError(e)) return new NextResponse(e.code === "CONFLICT" ? "INTEGRITY_CHECK_FAILED" : "NOT_FOUND", { status: e.code === "CONFLICT" ? 409 : 404 });
    throw e;
  }
}
