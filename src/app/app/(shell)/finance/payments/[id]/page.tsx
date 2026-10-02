import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { getPayment } from "@/server/finance/payments";
import { personName } from "@/lib/os/crm-page";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, fmtDate, fmtDateTime, PermissionDenied, SectionCard } from "@/components/os/ui";
import { ReversePayment } from "@/components/finance/Widgets";
import { invoiceTone, paymentTone } from "@/components/finance/tones";

export const metadata = { title: "Payment" };

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, allowed } = await pageCtx("finance.payments.view");
  if (!allowed) return <PermissionDenied permission="finance.payments.view" />;
  const locale = await getLocale();
  const t = await getTranslations("os.finance");
  let d;
  try {
    d = await getPayment(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const p = d.payment;
  const m = (v: { toFixed(n: number): string }) => formatMoney(v.toFixed(2), locale, p.currency);
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/finance/payments" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint">{t("payment")}</p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            <span dir="ltr">{p.number}</span>
            <Badge tone={paymentTone(p.status)} dot>
              {t(`pstatus.${p.status}` as "pstatus.RECORDED")}
            </Badge>
          </h1>
          <p className="mt-1 text-xs text-os-muted">
            <Link href={`/app/crm/clients/${p.client.id}?tab=finance`} className="hover:text-iris-light">
              {p.client.displayName}
            </Link>{" "}
            · {fmtDate(p.paymentDate, locale)} · {t(`method.${p.method}` as "method.CASH")}
            {p.reference && <span dir="ltr"> · {p.reference}</span>}
          </p>
        </div>
        <p className={`text-2xl font-semibold tabular ${p.status === "REVERSED" ? "text-os-faint line-through" : ""}`} dir="ltr">
          {m(p.amount)}
        </p>
      </div>
      {p.status === "RECORDED" && can(ctx, "finance.payments.reverse") && (
        <div className="flex justify-end">
          <ReversePayment id={p.id} />
        </div>
      )}
      {p.status === "REVERSED" && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {t("reversedBecause")}: {p.reversalReason} · {personName(d.reverser, locale) ?? "—"} · {p.reversedAt ? fmtDateTime(p.reversedAt, locale) : ""}
        </p>
      )}
      <SectionCard title={t("allocations")}>
        <ul className="divide-y divide-os-line text-sm">
          {p.allocations.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <Link href={`/app/finance/invoices/${a.invoice.id}`} className="font-medium hover:text-iris-light" dir="ltr">
                {a.invoice.number}
              </Link>
              <Badge tone={invoiceTone(a.invoice.status)}>{t(`status.${a.invoice.status}` as "status.PAID")}</Badge>
              <span className="text-xs text-os-muted">
                {t("total")} <span dir="ltr">{m(a.invoice.total)}</span> · {t("balance")} <span dir="ltr">{m(a.invoice.balanceDue)}</span>
              </span>
              <span className="flex-1" />
              <span className="font-semibold tabular" dir="ltr">
                {m(a.amount)}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard title={t("details")}>
        <dl className="grid gap-2 p-4 text-xs">
          {(
            [
              [t("recordedBy"), `${personName(p.createdBy, locale) ?? "—"} · ${fmtDateTime(p.createdAt, locale)}`],
              [t("f.notes"), p.notes ?? "—"],
              [t("f.currency"), p.currency]
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="grid grid-cols-[110px_1fr] gap-2">
              <dt className="text-os-muted">{k}</dt>
              <dd dir="auto">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("paymentImmutableNote")}</p>
      </SectionCard>
    </div>
  );
}
