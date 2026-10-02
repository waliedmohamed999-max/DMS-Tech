import { NextResponse, type NextRequest } from "next/server";
import { getSession, requireCtx } from "@/lib/os/dal";
import { exportCsv, type ExportKind } from "@/server/finance/export";
import { isAppError } from "@/server/errors";
import { prisma } from "@/server/db";

/** CSV export of a finance list — same filters + permission scope as the list page; audited. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/app/login", req.url));
  const ctx = await requireCtx();
  const { kind } = await params;
  if (!["invoices", "payments", "expenses", "aging"].includes(kind)) return new NextResponse("NOT_FOUND", { status: 404 });
  const filters = Object.fromEntries(req.nextUrl.searchParams.entries());
  try {
    const csv = await exportCsv(ctx, kind as ExportKind, filters);
    await prisma.auditLog.create({ data: { organizationId: ctx.organizationId, actorId: ctx.userId, action: "finance.exported", entityType: "Export", entityId: kind, after: { kind, filters, rows: csv.split("\r\n").length - 2 } } });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (e) {
    if (isAppError(e)) return new NextResponse(e.code, { status: e.code === "FORBIDDEN" ? 403 : 404 });
    throw e;
  }
}
