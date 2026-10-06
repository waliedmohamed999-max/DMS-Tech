import { NextResponse, type NextRequest } from "next/server";
import { getSession, requireCtx } from "@/lib/os/dal";
import { getQuotation } from "@/server/commercial/quotations";
import { quotationPdfFor } from "@/server/pdf/quotation";
import { isAppError } from "@/server/errors";

/**
 * PDF of a quotation version (?v=N, default current). Permission + record scope are checked by
 * getQuotation. A version that was sent returns the stored artifact (the exact bytes the
 * client received, sha256 in the X-Content-SHA256 header); other versions render on demand
 * from the database (DRAFT watermark when not approved).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/app/login", req.url));
  // a temporary password must be replaced before anything else is allowed (same rule as pages and actions)
  if (session.user.mustChangePassword) return NextResponse.redirect(new URL("/app/me?force=1", req.url));
  const ctx = await requireCtx();
  const { id } = await params;
  const v = Number(req.nextUrl.searchParams.get("v")) || undefined;
  try {
    const { version } = await getQuotation(ctx, id, v);
    const pdf = await quotationPdfFor(ctx.organizationId, version.id);
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(pdf.data), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${pdf.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-SHA256": pdf.sha256,
        "X-Document-Source": pdf.stored ? "stored-sent-artifact" : "rendered"
      }
    });
  } catch (e) {
    if (isAppError(e)) return new NextResponse(e.code, { status: e.code === "FORBIDDEN" ? 403 : 404 });
    throw e;
  }
}
