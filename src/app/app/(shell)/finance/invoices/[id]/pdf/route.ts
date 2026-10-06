import { NextResponse, type NextRequest } from "next/server";
import { getSession, requireCtx } from "@/lib/os/dal";
import { getInvoice } from "@/server/finance/invoices";
import { invoicePdfFor } from "@/server/pdf/invoice";
import { isAppError } from "@/server/errors";

/**
 * Invoice PDF. Permission + finance scope are checked by getInvoice.
 *   ?original=1   the exact bytes stored at issue (sha256 in X-Content-SHA256)
 *   default       a current copy rendered from the frozen invoice snapshot + payment status
 *   ?lang=ar|en   render the same snapshot in the other language
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/app/login", req.url));
  // a temporary password must be replaced before anything else is allowed (same rule as pages and actions)
  if (session.user.mustChangePassword) return NextResponse.redirect(new URL("/app/me?force=1", req.url));
  const ctx = await requireCtx();
  const { id } = await params;
  const lang = req.nextUrl.searchParams.get("lang");
  try {
    await getInvoice(ctx, id);
    const pdf = await invoicePdfFor(ctx.organizationId, id, { original: req.nextUrl.searchParams.get("original") === "1", language: lang === "ar" || lang === "en" ? lang : undefined });
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(pdf.data), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${pdf.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-SHA256": pdf.sha256,
        "X-Document-Source": pdf.stored ? "stored-issued-artifact" : "rendered-from-snapshot"
      }
    });
  } catch (e) {
    if (isAppError(e)) return new NextResponse(e.code, { status: e.code === "FORBIDDEN" ? 403 : 404 });
    throw e;
  }
}
