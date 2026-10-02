import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { can, type Ctx } from "@/server/context";
import { projectWhere } from "@/server/projects/access";
import { clientFinance } from "@/server/finance/costing";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, fmtDate, SectionCard } from "@/components/os/ui";
import { invoiceTone, paymentTone } from "./tones";
import { healthTone, projectStatusTone } from "@/components/projects/tones";

/** Client 360 → Finance: invoiced / paid / outstanding / overdue, invoices and payments (finance permissions + scope). */
export async function ClientFinanceTab({ ctx, clientId }: { ctx: Ctx; clientId: string }) {
  const locale = await getLocale();
  const t = await getTranslations("os.finance");
  const f = await clientFinance(ctx, clientId);
  const m = (v: string | { toFixed(n: number): string }, c = "SAR") => formatMoney(typeof v === "string" ? v : v.toFixed(2), locale, c);
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-os-line bg-os-line md:grid-cols-4">
        {(
          [
            ["invoiced", f.totals.invoiced, ""],
            ["paid", f.totals.paid, "text-success"],
            ["outstanding", f.totals.outstanding, Number(f.totals.outstanding) > 0 ? "text-warning" : ""],
            ["overdue", f.totals.overdue, Number(f.totals.overdue) > 0 ? "text-danger" : ""]
          ] as const
        ).map(([k, v, cls]) => (
          <div key={k} className="bg-os-surface px-4 py-3">
            <p className="text-[11.5px] text-os-muted">{t(`c.${k}` as "c.invoiced")}</p>
            <p className={`mt-0.5 text-lg font-semibold tabular ${cls}`} dir="ltr">
              {m(v)}
            </p>
          </div>
        ))}
      </div>
      <SectionCard
        title={t("invoices")}
        action={can(ctx, "finance.invoices.create") ? <Link href={`/app/finance/invoices/new?client=${clientId}`} className="os-btn-primary h-8 px-3 text-xs">+ {t("newInvoice")}</Link> : undefined}
      >
        {f.invoices.length === 0 ? (
          <EmptyState icon="FileText" title={t("noInvoices")} text="" />
        ) : (
          <ul className="divide-y divide-os-line text-sm">
            {f.invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Link href={`/app/finance/invoices/${i.id}`} className="font-medium hover:text-iris-light" dir="ltr">
                  {i.number ?? t("draftNo")}
                </Link>
                <span className="text-xs text-os-muted">
                  {fmtDate(i.issueDate, locale)} → {fmtDate(i.dueDate, locale)}
                  {i.project ? ` · ${i.project.number}` : ""}
                </span>
                <span className="flex-1" />
                <Badge tone={invoiceTone(i.status)}>{t(`status.${i.status}` as "status.PAID")}</Badge>
                <span className="w-28 text-end text-xs tabular" dir="ltr">
                  {m(i.total, i.currency)}
                </span>
                <span className={`w-28 text-end text-xs font-semibold tabular ${i.balanceDue.gt(0) && !["DRAFT", "CANCELLED", "VOID"].includes(i.status) ? "" : "text-os-faint"}`} dir="ltr">
                  {m(i.balanceDue, i.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      {f.payments && (
        <SectionCard title={t("payments")}>
          {f.payments.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-os-muted">{t("noPayments")}</p>
          ) : (
            <ul className="divide-y divide-os-line text-sm">
              {f.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <Link href={`/app/finance/payments/${p.id}`} className="font-medium hover:text-iris-light" dir="ltr">
                    {p.number}
                  </Link>
                  <span className="text-xs text-os-muted">
                    {fmtDate(p.paymentDate, locale)} · {t(`method.${p.method}` as "method.CASH")}
                  </span>
                  <span className="flex-1" />
                  <Badge tone={paymentTone(p.status)}>{t(`pstatus.${p.status}` as "pstatus.RECORDED")}</Badge>
                  <span className={`text-sm font-semibold tabular ${p.status === "REVERSED" ? "text-os-faint line-through" : ""}`} dir="ltr">
                    {m(p.amount, p.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
    </div>
  );
}

/** Client 360 → Projects (delivery scope; no commercial values). */
export async function ClientProjectsTab({ ctx, clientId }: { ctx: Ctx; clientId: string }) {
  const locale = await getLocale();
  const tp = await getTranslations("os.projects");
  const rows = await prisma.project.findMany({
    where: { organizationId: ctx.organizationId, clientId, ...((await projectWhere(ctx)) as Prisma.ProjectWhereInput) },
    orderBy: { createdAt: "desc" },
    select: { id: true, number: true, name: true, status: true, health: true, progress: true, targetEndDate: true }
  });
  return (
    <SectionCard title={tp("title")}>
      {rows.length === 0 ? (
        <EmptyState icon="Layers" title={tp("emptyTitle")} text="" />
      ) : (
        <ul className="divide-y divide-os-line text-sm">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <Link href={`/app/projects/${p.id}`} className="font-medium hover:text-iris-light">
                  {p.name}
                </Link>
                <span className="block text-[11px] text-os-faint" dir="ltr">
                  {p.number}
                </span>
              </div>
              <Badge tone={projectStatusTone(p.status)}>{tp(`status.${p.status}` as "status.ACTIVE")}</Badge>
              <Badge tone={healthTone(p.health)}>{tp(`health.${p.health}` as "health.HEALTHY")}</Badge>
              <span className="text-xs tabular">{p.progress}%</span>
              <span className="text-xs text-os-muted">{p.targetEndDate ? fmtDate(p.targetEndDate, locale) : "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
