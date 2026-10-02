import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { listInvoices } from "@/server/finance/invoices";
import { sweepFinanceIfDue } from "@/server/finance/sweep";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, flatParams, fmtDate, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { invoiceTone } from "@/components/finance/tones";

export const metadata = { title: "Invoices" };
const STATUSES = ["DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED", "VOID"];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("finance.invoices.view");
  if (!allowed) return <PermissionDenied permission="finance.invoices.view" />;
  await sweepFinanceIfDue(ctx.organizationId);
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.finance");
  const data = await listInvoices(ctx, sp);
  const m = (v: { toFixed(n: number): string } | string, c = "SAR") => formatMoney(typeof v === "string" ? v : v.toFixed(2), locale, c);
  const sortHref = (key: string) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    p.set("sort", key);
    p.set("dir", sp.sort === key && sp.dir !== "asc" ? "asc" : "desc");
    p.delete("page");
    return `?${p}`;
  };
  const exportHref = `/app/finance/export/invoices?${new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][])}`;
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="FileText"
        title={t("invoices")}
        subtitle={t("invoicesSubtitle")}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <a href={exportHref} download className="os-btn-ghost">
              {t("exportCsv")}
            </a>
            {can(ctx, "finance.invoices.create") && (
              <Link href="/app/finance/invoices/new" className="os-btn-primary">
                + {t("newInvoice")}
              </Link>
            )}
          </div>
        }
      />
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-os-line bg-os-line">
        {(
          [
            ["billed", data.sums.total],
            ["collected", data.sums.paid],
            ["outstanding", data.sums.balance]
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="bg-os-surface px-4 py-3">
            <p className="text-[11.5px] text-os-muted">{t(`k.${k}` as "k.billed")}</p>
            <p className={`mt-0.5 text-lg font-semibold tabular ${k === "outstanding" && Number(v) > 0 ? "text-warning" : ""}`} dir="ltr">
              {m(v, data.currency)}
            </p>
          </div>
        ))}
      </div>
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t("searchInvoices") }}
          selects={[
            { name: "status", allLabel: `${t("f.status")}: ${t("all")}`, options: [{ value: "open", label: t("openOnly") }, ...STATUSES.map((s) => ({ value: s, label: t(`status.${s}` as "status.PAID") }))] },
            { name: "owner", allLabel: `${t("f.owner")}: ${t("all")}`, options: [{ value: "me", label: t("mine") }] }
          ]}
        />
        {data.items.length === 0 ? (
          <EmptyState icon="FileText" title={t("noInvoices")} text={t("noInvoicesText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>
                    <Link href={sortHref("number")}>{t("f.invoice")}</Link>
                  </th>
                  <th>{t("f.client")}</th>
                  <th className="hidden lg:table-cell">{t("f.project")}</th>
                  <th className="hidden md:table-cell">
                    <Link href={sortHref("issueDate")}>{t("f.issueDate")}</Link>
                  </th>
                  <th>
                    <Link href={sortHref("dueDate")}>{t("f.dueDate")}</Link>
                  </th>
                  <th className="text-end">
                    <Link href={sortHref("total")}>{t("total")}</Link>
                  </th>
                  <th className="hidden text-end xl:table-cell">{t("paid")}</th>
                  <th className="text-end">
                    <Link href={sortHref("balanceDue")}>{t("balance")}</Link>
                  </th>
                  <th>{t("f.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id}>
                    <td className="whitespace-nowrap">
                      <Link href={`/app/finance/invoices/${i.id}`} className="font-medium hover:text-iris-light" dir="ltr">
                        {i.number ?? t("draftNo")}
                      </Link>
                      <span className="block text-[10.5px] text-os-faint">{t(`source.${i.sourceType}` as "source.MANUAL")}</span>
                    </td>
                    <td className="max-w-[180px] truncate text-xs">{i.client.displayName}</td>
                    <td className="hidden max-w-[160px] truncate text-xs text-os-muted lg:table-cell">{i.project ? `${i.project.number}` : "—"}</td>
                    <td className="hidden whitespace-nowrap text-xs text-os-muted md:table-cell">{fmtDate(i.issueDate, locale)}</td>
                    <td className={`whitespace-nowrap text-xs ${i.status === "OVERDUE" ? "text-danger" : "text-os-muted"}`}>{fmtDate(i.dueDate, locale)}</td>
                    <td className="whitespace-nowrap text-end text-xs tabular" dir="ltr">
                      {m(i.total, i.currency)}
                    </td>
                    <td className="hidden whitespace-nowrap text-end text-xs tabular text-os-muted xl:table-cell" dir="ltr">
                      {m(i.paidAmount, i.currency)}
                    </td>
                    <td className={`whitespace-nowrap text-end text-xs font-semibold tabular ${i.balanceDue.gt(0) && !["DRAFT", "CANCELLED", "VOID"].includes(i.status) ? "" : "text-os-faint"}`} dir="ltr">
                      {m(i.balanceDue, i.currency)}
                    </td>
                    <td>
                      <Badge tone={invoiceTone(i.status)} dot>
                        {t(`status.${i.status}` as "status.PAID")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/finance/invoices" params={sp} />
      </div>
    </div>
  );
}
