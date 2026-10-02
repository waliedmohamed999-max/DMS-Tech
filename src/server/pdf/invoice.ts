import { prisma, type Tx } from "../db";
import { notFound } from "../errors";
import { todayIn } from "../commercial/dates";
import { formatMoney } from "@/lib/commercial/calc";
import { COLORS, PAGE, createDoc, header, parties, section, tableHeader, columnXs, type Column } from "./doc";
import { ltr } from "./text";

/**
 * Invoice PDF — DB-authoritative.
 *
 * Issued invoices are rendered ONLY from the invoice's own frozen snapshot (lines, totals,
 * seller/buyer snapshots and payment instructions captured at issue); current company or client
 * data is never read for them. The bytes rendered at issue are stored append-only
 * (CommercialDocument INVOICE_PDF) and served as the "original". A "current copy" adds the
 * payment status (paid / balance as of today) from the payment ledger. Drafts carry a DRAFT
 * watermark and use live data.
 */

const L = {
  ar: {
    title: "فاتورة ضريبية", draftTitle: "مسودة فاتورة", number: "رقم الفاتورة", issue: "تاريخ الإصدار", due: "تاريخ الاستحقاق", status: "الحالة",
    from: "المورد", to: "العميل", vat: "الرقم الضريبي", cr: "السجل التجاري", attn: "عناية", no: "#", item: "الوصف", qty: "الكمية", price: "سعر الوحدة",
    discount: "الخصم", tax: "الضريبة", total: "الإجمالي", subtotal: "المجموع قبل الخصم", discountTotal: "إجمالي الخصم", taxable: "المبلغ الخاضع للضريبة",
    vatTotal: "ضريبة القيمة المضافة", grand: "الإجمالي شامل الضريبة", paid: "المدفوع", balance: "الرصيد المستحق", asOf: (d: string) => `حالة السداد حتى ${d}`,
    payment: "تعليمات الدفع", terms: "شروط الدفع", notes: "ملاحظات", refs: "المرجع", contract: "العقد", project: "المشروع", quotation: "عرض السعر",
    draft: "مسودة — ليست فاتورة صادرة", void: "ملغاة", amountsIn: (c: string) => `جميع المبالغ بعملة ${c}`, page: (p: number, n: number) => `صفحة ${p} من ${n}`,
    statusText: { DRAFT: "مسودة", ISSUED: "صادرة", SENT: "مُرسلة", PARTIALLY_PAID: "مدفوعة جزئيًا", PAID: "مدفوعة", OVERDUE: "متأخرة", CANCELLED: "ملغاة", VOID: "ملغاة (باطلة)" } as Record<string, string>
  },
  en: {
    title: "TAX INVOICE", draftTitle: "DRAFT INVOICE", number: "Invoice no.", issue: "Issue date", due: "Due date", status: "Status",
    from: "Seller", to: "Bill to", vat: "VAT no.", cr: "CR no.", attn: "Attn.", no: "#", item: "Description", qty: "Qty", price: "Unit price",
    discount: "Discount", tax: "VAT", total: "Total", subtotal: "Subtotal", discountTotal: "Discount", taxable: "Taxable amount",
    vatTotal: "VAT", grand: "Total incl. VAT", paid: "Paid", balance: "Balance due", asOf: (d: string) => `Payment status as of ${d}`,
    payment: "Payment instructions", terms: "Payment terms", notes: "Notes", refs: "Reference", contract: "Contract", project: "Project", quotation: "Quotation",
    draft: "DRAFT — NOT AN ISSUED INVOICE", void: "VOID", amountsIn: (c: string) => `All amounts in ${c}`, page: (p: number, n: number) => `Page ${p} of ${n}`,
    statusText: { DRAFT: "Draft", ISSUED: "Issued", SENT: "Sent", PARTIALLY_PAID: "Partially paid", PAID: "Paid", OVERDUE: "Overdue", CANCELLED: "Cancelled", VOID: "Void" } as Record<string, string>
  }
};

type Party = { name?: string | null; nameAr?: string | null; legalName?: string | null; vatNumber?: string | null; taxNumber?: string | null; crNumber?: string | null; address?: string | null; city?: string | null; phone?: string | null; email?: string | null; contact?: string | null; contactTitle?: string | null };

const num = (v: { toFixed(n: number): string } | string, dp = 2) => {
  const s = typeof v === "string" ? v : v.toFixed(dp);
  const [i, f] = s.split(".");
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${f ? `.${f}` : ""}`;
};
const qtyStr = (v: { toFixed(n: number): string }) => v.toFixed(3).replace(/\.?0+$/, "");
/** keep "(40%)" / "12.5%" readable inside RTL text: isolate them left-to-right */
const isoPct = (s: string) => s.replace(/\(?\d+(?:[.,]\d+)?%\)?/g, (m) => ltr(m));
const dateStr = (d: Date, lang: "ar" | "en") => new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);

/**
 * @param opts.original  render exactly what was issued (no payment status) — used once at issue
 * @param opts.language  override the invoice language (renders the same snapshot in the other language)
 */
export async function renderInvoicePdf(db: Tx | typeof prisma, organizationId: string, invoiceId: string, opts: { original?: boolean; language?: "ar" | "en" } = {}) {
  const inv = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      client: true,
      contact: true,
      contract: { select: { number: true } },
      project: { select: { number: true } },
      quotation: { select: { number: true } },
      quotationVersion: { select: { versionNumber: true } }
    }
  });
  if (!inv) throw notFound("Invoice");
  const issued = inv.status !== "DRAFT" && inv.status !== "CANCELLED";
  const lang = opts.language ?? inv.language;
  const t = L[lang];
  const rtl = lang === "ar";
  let seller: Party;
  let buyer: Party;
  let instructions: string | null;
  if (issued) {
    seller = (inv.sellerSnapshot ?? {}) as Party;
    buyer = (inv.buyerSnapshot ?? {}) as Party;
    instructions = inv.paymentInstructions;
  } else {
    const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
    seller = { ...org };
    buyer = { name: inv.client.displayName, taxNumber: inv.client.taxNumber, address: inv.client.address, city: inv.client.city, email: inv.contact?.email ?? inv.client.email, phone: inv.contact?.phone ?? inv.client.phone, contact: inv.contact ? `${inv.contact.firstName} ${inv.contact.lastName ?? ""}`.trim() : null, contactTitle: inv.contact?.jobTitle };
    instructions = org.invoicePaymentInstructions;
  }
  const sellerName = (rtl ? seller.nameAr : null) ?? seller.legalName ?? seller.name ?? "";
  const label = inv.number ?? t.draftTitle;
  const watermark = !issued ? t.draft : inv.status === "VOID" ? t.void : null;
  const d = createDoc({
    rtl,
    title: label,
    watermark,
    footer: (p, n) => [sellerName, seller.vatNumber ? `${t.vat} ${ltr(seller.vatNumber)}` : null, ltr(inv.number ?? ""), inv.contentHash ? ltr(`#${inv.contentHash.slice(0, 12)}`) : null, t.page(p, n)].filter(Boolean).join("  ·  ")
  });

  header(d, issued ? t.title : t.draftTitle, [
    [t.number, inv.number ?? "—"],
    [t.issue, dateStr(inv.issueDate, lang)],
    [t.due, dateStr(inv.dueDate, lang)],
    ...(!opts.original && issued ? ([[t.status, t.statusText[inv.status] ?? inv.status]] as [string, string][]) : [])
  ]);

  const refs = [inv.contract ? `${t.contract} ${ltr(inv.contract.number)}` : null, inv.project ? `${t.project} ${ltr(inv.project.number)}` : null, inv.quotation ? `${t.quotation} ${ltr(`${inv.quotation.number}${inv.quotationVersion ? ` V${inv.quotationVersion.versionNumber}` : ""}`)}` : null].filter(Boolean).join("  ·  ");
  parties(
    d,
    {
      title: t.from,
      lines: [sellerName, [seller.address, seller.city].filter(Boolean).join("، "), [ltr(seller.phone), seller.email].filter(Boolean).join("  ·  "), seller.vatNumber ? `${t.vat}: ${ltr(seller.vatNumber)}` : "", seller.crNumber ? `${t.cr}: ${ltr(seller.crNumber)}` : ""]
    },
    {
      title: t.to,
      lines: [buyer.name ?? "", buyer.contact ? `${t.attn} ${buyer.contact}${buyer.contactTitle ? ` — ${buyer.contactTitle}` : ""}` : "", [buyer.address, buyer.city].filter(Boolean).join("، "), [buyer.email, ltr(buyer.phone)].filter(Boolean).join("  ·  "), buyer.taxNumber ? `${t.vat}: ${ltr(buyer.taxNumber)}` : "", refs ? `${t.refs}: ${refs}` : ""]
    }
  );

  const cols: Column[] = [
    { key: "no", title: t.no, width: 22, align: "center" },
    { key: "item", title: t.item, width: 205 },
    { key: "qty", title: t.qty, width: 44, align: "center" },
    { key: "price", title: t.price, width: 66, align: "center" },
    { key: "disc", title: t.discount, width: 56, align: "center" },
    { key: "tax", title: t.tax, width: 42, align: "center" },
    { key: "total", title: t.total, width: 80, align: "center" }
  ];
  const xs = columnXs(d, cols);
  d.ensure(60);
  tableHeader(d, cols);
  inv.items.forEach((it, i) => {
    d.font("regular", 8.5);
    const desc = rtl ? isoPct(it.description) : it.description;
    const h = d.measure(desc, cols[1].width - 8);
    d.ensure(Math.max(h, 14) + 10, () => tableHeader(d, cols));
    const y = d.y;
    d.font("regular", 8.5, COLORS.muted);
    d.text(String(i + 1), xs[0] + 4, y, cols[0].width - 8, { align: "center" });
    d.font("regular", 8.5, COLORS.ink);
    const yy = d.text(desc, xs[1] + 4, y, cols[1].width - 8);
    d.text(`${qtyStr(it.quantity)}${it.unit ? ` ${it.unit}` : ""}`, xs[2] + 4, y, cols[2].width - 8, { align: "center" });
    d.text(num(it.unitPrice), xs[3] + 4, y, cols[3].width - 8, { align: "center" });
    d.text(it.discountAmount.isZero() ? "—" : num(it.discountAmount), xs[4] + 4, y, cols[4].width - 8, { align: "center" });
    d.text(`${num(it.taxRate)}%`, xs[5] + 4, y, cols[5].width - 8, { align: "center" });
    d.font("semibold", 8.5, COLORS.ink);
    d.text(num(it.total), xs[6] + 4, y, cols[6].width - 8, { align: "center" });
    d.y = Math.max(yy, y + 14) + 6;
    d.hr(d.y - 3);
  });

  const m = (v: { toFixed(n: number): string }) => formatMoney(v.toFixed(2), lang, inv.currency);
  const taxable = inv.subtotal.minus(inv.discountTotal);
  const rows: [string, string, "n" | "strong" | "band"][] = [
    [t.subtotal, m(inv.subtotal), "n"],
    ...(inv.discountTotal.gt(0) ? ([[t.discountTotal, `−${m(inv.discountTotal)}`, "n"], [t.taxable, m(taxable), "n"]] as [string, string, "n"][]) : []),
    [t.vatTotal, m(inv.taxTotal), "n"],
    [t.grand, m(inv.total), "band"]
  ];
  if (!opts.original && issued) rows.push([t.paid, m(inv.paidAmount), "n"], [t.balance, m(inv.balanceDue), "strong"]);
  d.ensure(rows.length * 18 + 40);
  d.y += 6;
  const boxW = 250;
  const boxX = rtl ? PAGE.m : PAGE.w - PAGE.m - boxW;
  for (const [k, val, kind] of rows) {
    if (kind === "band") {
      d.pdf.rect(boxX, d.y - 4, boxW, 24).fill(COLORS.band);
      d.font("bold", 11, COLORS.ink);
    } else if (kind === "strong") d.font("bold", 10, inv.balanceDue.gt(0) ? COLORS.danger : COLORS.ink);
    else d.font("regular", 9, COLORS.muted);
    d.text(k, boxX + 8, d.y + (kind === "band" ? 1 : 0), boxW - 16, { align: "start" });
    if (kind === "n") d.font("semibold", 9, COLORS.ink);
    d.y = d.text(val, boxX + 8, d.y + (kind === "band" ? 1 : 0), boxW - 16, { align: "end" }) + (kind === "band" ? 8 : 4);
  }
  d.font("regular", 7.5, COLORS.faint);
  d.y = d.text(t.amountsIn(inv.currency), boxX + 8, d.y, boxW - 16, { align: "end" }) + 4;
  if (!opts.original && issued) {
    // "as of" is the company's calendar day, not the UTC date
    const tz = (await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } })).timezone;
    d.y = d.text(t.asOf(dateStr(todayIn(tz), lang)), boxX + 8, d.y, boxW - 16, { align: "end" }) + 10;
  }
  else d.y += 10;

  section(d, t.payment, instructions);
  section(d, t.terms, inv.paymentTerms);
  section(d, t.notes, inv.notes);

  const out = await d.finish();
  return { ...out, language: lang, fileName: `${inv.number ?? `DRAFT-${inv.id.slice(-6)}`}-${lang}${opts.original || !issued ? "" : "-copy"}.pdf` };
}

/**
 * The file to hand out: `original` → the stored bytes rendered at issue (exactly what was issued),
 * otherwise a current copy rendered from the frozen snapshot + payment status.
 */
export async function invoicePdfFor(organizationId: string, invoiceId: string, opts: { original?: boolean; language?: "ar" | "en" } = {}) {
  if (opts.original) {
    const stored = await prisma.commercialDocument.findFirst({ where: { organizationId, invoiceId, kind: "INVOICE_PDF", ...(opts.language ? { language: opts.language } : {}) }, orderBy: { createdAt: "asc" } });
    if (stored) return { data: Buffer.from(stored.data), sha256: stored.sha256, fileName: stored.fileName, stored: true };
  }
  const r = await renderInvoicePdf(prisma, organizationId, invoiceId, { language: opts.language });
  return { data: r.data, sha256: r.sha256, fileName: r.fileName, stored: false };
}
