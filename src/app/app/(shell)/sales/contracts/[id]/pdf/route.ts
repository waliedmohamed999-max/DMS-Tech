import { NextResponse, type NextRequest } from "next/server";
import { getSession, requireCtx } from "@/lib/os/dal";
import { getContract } from "@/server/commercial/contracts";
import { renderContractPdf } from "@/server/pdf/contract";
import { isAppError } from "@/server/errors";

/** Contract document for signature outside the system (permission + scope via getContract). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/app/login", req.url));
  // a temporary password must be replaced before anything else is allowed (same rule as pages and actions)
  if (session.user.mustChangePassword) return NextResponse.redirect(new URL("/app/me?force=1", req.url));
  const ctx = await requireCtx();
  const { id } = await params;
  try {
    await getContract(ctx, id);
    const pdf = await renderContractPdf(ctx.organizationId, id);
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(pdf.data), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${pdf.fileName}"`, "Cache-Control": "private, no-store", "X-Content-SHA256": pdf.sha256 }
    });
  } catch (e) {
    if (isAppError(e)) return new NextResponse(e.code, { status: e.code === "FORBIDDEN" ? 403 : 404 });
    throw e;
  }
}
