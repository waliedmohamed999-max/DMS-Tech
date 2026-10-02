import { NextResponse, type NextRequest } from "next/server";
import { getSession, requireCtx } from "@/lib/os/dal";
import { payslipEntry } from "@/server/hr/payroll";
import { renderPayslip } from "@/server/pdf/payslip";
import { isAppError } from "@/server/errors";

/**
 * Payslip PDF, rendered from the frozen PayrollEntry snapshot.
 * Access (payslipEntry): the employee themself once the period is PAID/CLOSED, or hr.payroll.view.
 *   ?lang=ar|en
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/app/login", req.url));
  const ctx = await requireCtx();
  const { id } = await params;
  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "ar";
  try {
    const entry = await payslipEntry(ctx, id);
    const pdf = await renderPayslip(ctx.organizationId, entry, lang);
    return new NextResponse(new Uint8Array(pdf.data), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${pdf.fileName}"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (e) {
    if (isAppError(e)) return new NextResponse(e.code, { status: e.code === "FORBIDDEN" ? 403 : 404 });
    throw e;
  }
}
