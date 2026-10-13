import { Icon, type IconName } from "@/components/ui/Icon";
import { encodeQr } from "@/server/pdf/qrcode";
import { zatcaQr } from "@/server/pdf/invoice";

/**
 * Invoice page building blocks (server components): the lifecycle stepper, the payment progress bar and a paper
 * preview of the document as the client receives it (including the ZATCA QR once issued). Labels are local to
 * these blocks (Arabic / English).
 */

type Lc = "ar" | "en";
const T = {
  ar: {
    steps: ["مسودة", "صادرة", "مُرسلة", "مدفوعة"],
    overdue: "متأخرة",
    partly: "مدفوعة جزئياً",
    paidOf: (p: number) => `تم تحصيل ${p}%`,
    preview: "معاينة الفاتورة",
    previewNote: "كما تظهر للعميل في ملف PDF",
    seller: "المورد",
    buyer: "العميل",
    vat: "الرقم الضريبي",
    cr: "السجل التجاري",
    item: "الوصف",
    qty: "الكمية",
    price: "السعر",
    total: "الإجمالي",
    subtotal: "المجموع",
    discount: "الخصم",
    vatTotal: "ضريبة القيمة المضافة",
    grand: "الإجمالي شامل الضريبة",
    title: "فاتورة ضريبية",
    draft: "مسودة",
    issue: "تاريخ الإصدار",
    due: "تاريخ الاستحقاق",
    qr: "رمز هيئة الزكاة والضريبة والجمارك",
    noQr: "يظهر رمز QR بعد إضافة الرقم الضريبي للشركة في الإعدادات وإصدار الفاتورة."
  },
  en: {
    steps: ["Draft", "Issued", "Sent", "Paid"],
    overdue: "Overdue",
    partly: "Partially paid",
    paidOf: (p: number) => `${p}% collected`,
    preview: "Invoice preview",
    previewNote: "As the client sees it in the PDF",
    seller: "Seller",
    buyer: "Bill to",
    vat: "VAT no.",
    cr: "CR no.",
    item: "Description",
    qty: "Qty",
    price: "Price",
    total: "Total",
    subtotal: "Subtotal",
    discount: "Discount",
    vatTotal: "VAT",
    grand: "Total incl. VAT",
    title: "Tax Invoice",
    draft: "Draft",
    issue: "Issue date",
    due: "Due date",
    qr: "ZATCA QR code",
    noQr: "The QR code appears once the company VAT number is set in Settings and the invoice is issued."
  }
};
const lc = (locale: string): Lc => (locale === "ar" ? "ar" : "en");

type StepInv = { status: string; createdAt: Date; issuedAt: Date | null; sentAt: Date | null; paidAt: Date | null; dueDate: Date };

/** Draft → Issued → Sent → Paid, with the date of each reached step. Cancelled / void invoices show no stepper. */
export function InvoiceStepper({ inv, locale, fmt }: { inv: StepInv; locale: string; fmt: (d: Date) => string }) {
  if (inv.status === "CANCELLED" || inv.status === "VOID") return null;
  const t = T[lc(locale)];
  const dates = [inv.createdAt, inv.issuedAt, inv.sentAt, inv.paidAt];
  const icons: IconName[] = ["Pencil", "FileText", "Send", "CircleCheck"];
  // the furthest step reached; an overdue / partially paid invoice is "in progress" on the payment step
  const reached = inv.status === "PAID" ? 3 : inv.sentAt ? 2 : inv.issuedAt ? 1 : 0;
  const payState = inv.status === "OVERDUE" ? "overdue" : inv.status === "PARTIALLY_PAID" ? "partly" : null;
  return (
    <ol className="os-card grid grid-cols-4 gap-2 p-4">
      {t.steps.map((label, i) => {
        const done = i <= reached;
        const pending = i === 3 && payState;
        const tone = pending === "overdue" ? "border-danger bg-danger/10 text-danger" : pending ? "border-warning bg-warning/10 text-warning" : done ? "border-iris bg-iris text-white" : "border-os-line-strong bg-os-panel text-os-faint";
        return (
          <li key={label} className="relative grid justify-items-center gap-1.5 text-center">
            {i > 0 && <span aria-hidden className={`absolute top-4 h-0.5 w-[calc(100%-2.5rem)] ltr:right-[calc(50%+1.25rem)] rtl:left-[calc(50%+1.25rem)] ${done ? "bg-iris" : "bg-os-line"}`} />}
            <span className={`relative grid size-8 place-items-center rounded-full border-2 ${tone}`}>
              <Icon name={pending === "overdue" ? "Clock" : icons[i]} size={14} />
            </span>
            <span className={`text-xs font-medium ${done || pending ? "text-os-text" : "text-os-faint"}`}>{pending === "overdue" ? t.overdue : pending === "partly" ? t.partly : label}</span>
            <span className="text-[11px] text-os-faint tabular">{done && dates[i] ? fmt(dates[i] as Date) : i === 3 && payState ? fmt(inv.dueDate) : " "}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Paid share of the total as a bar. */
export function PaymentProgress({ paid, total, locale, overdue }: { paid: number; total: number; locale: string; overdue: boolean }) {
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  return (
    <div className="grid gap-1.5 px-4 pb-4">
      <div className="h-2 overflow-hidden rounded-full bg-os-raised">
        <div className={`h-full rounded-full ${pct === 100 ? "bg-success" : overdue ? "bg-danger" : "bg-iris"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-os-muted">{T[lc(locale)].paidOf(pct)}</p>
    </div>
  );
}

type Party = { name?: string | null; nameAr?: string | null; legalName?: string | null; vatNumber?: string | null; taxNumber?: string | null; crNumber?: string | null; address?: string | null; city?: string | null; email?: string | null; phone?: string | null };
type Money = { toFixed(n: number): string; gt(n: number): boolean };
type PaperInv = {
  status: string;
  number: string | null;
  issuedAt: Date | null;
  issueDate: Date;
  dueDate: Date;
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  total: Money;
  items: { id: string; description: string; quantity: { toFixed(n: number): string }; unit: string | null; unitPrice: Money; total: Money }[];
};

function QrSvg({ payload }: { payload: string }) {
  const m = encodeQr(payload);
  const q = 2;
  const n = m.length + q * 2;
  let d = "";
  m.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x + q} ${y + q}h1v1h-1z`)));
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className="size-28 rounded-md bg-white" shapeRendering="crispEdges" role="img" aria-label="ZATCA QR">
      <path d={d} fill="#000" />
    </svg>
  );
}

/** The document as the client receives it: parties, lines, totals and the ZATCA QR. */
export function InvoicePaper({ inv, seller, buyer, locale, money, fmt }: { inv: PaperInv; seller: Party; buyer: Party; locale: string; money: (v: Money) => string; fmt: (d: Date) => string }) {
  const t = T[lc(locale)];
  const issued = inv.status !== "DRAFT" && inv.status !== "CANCELLED";
  const qr = issued && seller.vatNumber && inv.issuedAt ? zatcaQr(seller, inv) : null;
  const sellerName = (locale === "ar" ? seller.nameAr : null) ?? seller.legalName ?? seller.name ?? "";
  const party = (title: string, p: Party, name: string) => (
    <div className="grid content-start gap-0.5 text-xs">
      <span className="mb-1 text-[11px] font-semibold text-iris-light">{title}</span>
      <span className="text-sm font-semibold text-os-text">{name}</span>
      {[p.address, p.city].filter(Boolean).length > 0 && <span className="text-os-muted">{[p.address, p.city].filter(Boolean).join("، ")}</span>}
      {(p.vatNumber ?? p.taxNumber) && (
        <span className="text-os-muted">
          {t.vat}: <span dir="ltr">{p.vatNumber ?? p.taxNumber}</span>
        </span>
      )}
      {p.crNumber && (
        <span className="text-os-muted">
          {t.cr}: <span dir="ltr">{p.crNumber}</span>
        </span>
      )}
    </div>
  );
  return (
    <section className="os-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-os-line px-4 py-3">
        <h2 className="text-sm font-semibold">{t.preview}</h2>
        <span className="text-[11px] text-os-faint">{t.previewNote}</span>
      </div>
      <div className="grid gap-5 bg-os-bg p-4 sm:p-6">
        <div className="grid gap-5 rounded-lg border border-os-line bg-os-panel p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-os-line pb-4">
            <div>
              <p className="text-lg font-bold">{issued ? t.title : t.draft}</p>
              <p className="text-xs text-os-muted" dir="ltr">
                {inv.number ?? "—"}
              </p>
            </div>
            <dl className="grid gap-0.5 text-xs">
              {(
                [
                  [t.issue, fmt(inv.issueDate)],
                  [t.due, fmt(inv.dueDate)]
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-os-muted">{k}</dt>
                  <dd className="font-medium tabular">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {party(t.seller, seller, sellerName)}
            {party(t.buyer, buyer, buyer.name ?? "")}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-os-raised text-os-muted">
                  <th className="px-2 py-2 text-start font-medium">{t.item}</th>
                  <th className="px-2 py-2 text-end font-medium">{t.qty}</th>
                  <th className="px-2 py-2 text-end font-medium">{t.price}</th>
                  <th className="px-2 py-2 text-end font-medium">{t.total}</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((x) => (
                  <tr key={x.id} className="border-b border-os-line last:border-0">
                    <td className="px-2 py-2" dir="auto">
                      {x.description}
                    </td>
                    <td className="px-2 py-2 text-end tabular" dir="ltr">
                      {x.quantity.toFixed(3).replace(/\.?0+$/, "")} {x.unit}
                    </td>
                    <td className="px-2 py-2 text-end tabular" dir="ltr">
                      {money(x.unitPrice)}
                    </td>
                    <td className="px-2 py-2 text-end font-semibold tabular" dir="ltr">
                      {money(x.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="grid justify-items-center gap-1.5">
              {qr ? <QrSvg payload={qr} /> : <p className="max-w-[220px] text-[11px] text-os-faint">{t.noQr}</p>}
              {qr && <span className="text-[10px] text-os-faint">{t.qr}</span>}
            </div>
            <dl className="grid min-w-[240px] gap-1.5 text-xs">
              {(
                [
                  [t.subtotal, money(inv.subtotal)],
                  ...(inv.discountTotal.gt(0) ? [[t.discount, `−${money(inv.discountTotal)}`]] : []),
                  [t.vatTotal, money(inv.taxTotal)]
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 text-os-muted">
                  <dt>{k}</dt>
                  <dd className="tabular" dir="ltr">
                    {v}
                  </dd>
                </div>
              ))}
              <div className="mt-1 flex justify-between gap-4 rounded-md bg-os-raised px-2 py-2 text-sm font-bold">
                <dt>{t.grand}</dt>
                <dd className="tabular" dir="ltr">
                  {money(inv.total)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
