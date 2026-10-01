import { prisma, type Tx } from "../db";
import { notFound } from "../errors";
import { formatMoney } from "@/lib/commercial/calc";
import { COLORS, PAGE, createDoc, header, parties, section, tableHeader, columnXs, type Column } from "./doc";
import { ltr } from "./text";

/**
 * Quotation PDF — rendered ONLY from the stored version (server-computed line amounts and
 * totals). Nothing is recalculated here and nothing comes from the browser. Versions that
 * were never sent carry a DRAFT watermark.
 */

const L = {
  ar: {
    title: "عرض سعر",
    number: "رقم العرض",
    version: "الإصدار",
    issue: "تاريخ الإصدار",
    valid: "صالح حتى",
    from: "من",
    to: "إلى",
    vat: "الرقم الضريبي",
    cr: "السجل التجاري",
    attn: "عناية",
    no: "#",
    item: "البند",
    qty: "الكمية",
    price: "سعر الوحدة",
    discount: "الخصم",
    tax: "الضريبة",
    total: "الإجمالي",
    subtotal: "المجموع الفرعي",
    discountTotal: "إجمالي الخصم",
    vatTotal: (r: string) => `ضريبة القيمة المضافة (${ltr(`${r}%`)})`,
    grand: "الإجمالي المستحق",
    message: "رسالة إلى العميل",
    payment: "شروط الدفع",
    delivery: "شروط التسليم",
    terms: "الشروط والأحكام",
    draft: "مسودة — غير معتمدة",
    amountsIn: (c: string) => `جميع المبالغ بعملة ${c}`,
    opp: "الفرصة",
    page: (p: number, n: number) => `صفحة ${p} من ${n}`
  },
  en: {
    title: "QUOTATION",
    number: "Quotation no.",
    version: "Version",
    issue: "Issue date",
    valid: "Valid until",
    from: "From",
    to: "Bill to",
    vat: "VAT no.",
    cr: "CR no.",
    attn: "Attn.",
    no: "#",
    item: "Item",
    qty: "Qty",
    price: "Unit price",
    discount: "Discount",
    tax: "VAT",
    total: "Total",
    subtotal: "Subtotal",
    discountTotal: "Discount",
    vatTotal: (r: string) => `VAT (${r}%)`,
    grand: "Grand total",
    message: "Message",
    payment: "Payment terms",
    delivery: "Delivery terms",
    terms: "Terms & conditions",
    draft: "DRAFT — NOT APPROVED",
    amountsIn: (c: string) => `All amounts in ${c}`,
    opp: "Opportunity",
    page: (p: number, n: number) => `Page ${p} of ${n}`
  }
};

const num = (v: { toFixed(n: number): string } | string, dp = 2) => {
  const s = typeof v === "string" ? v : v.toFixed(dp);
  const [i, f] = s.split(".");
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${f ? `.${f}` : ""}`;
};
const qtyStr = (v: { toFixed(n: number): string }) => v.toFixed(3).replace(/\.?0+$/, "");
const dateStr = (d: Date, lang: "ar" | "en") => new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);

const SENT: string[] = ["SENT", "VIEWED", "ACCEPTED", "REJECTED", "EXPIRED", "SUPERSEDED"];

export async function renderQuotationPdf(db: Tx | typeof prisma, organizationId: string, versionId: string) {
  const v = await db.quotationVersion.findFirst({
    where: { id: versionId, organizationId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      quotation: { include: { client: true, contact: true, opportunity: { select: { number: true, title: true } } } }
    }
  });
  if (!v) throw notFound("QuotationVersion");
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const lang = v.language;
  const t = L[lang];
  const rtl = lang === "ar";
  const q = v.quotation;
  const watermark = SENT.includes(v.status) || v.status === "APPROVED" ? null : t.draft;
  const companyName = (rtl ? org.nameAr : null) ?? org.legalName ?? org.name;
  const d = createDoc({
    rtl,
    title: `${q.number} V${v.versionNumber}`,
    watermark,
    footer: (p, n) => [companyName, ltr(org.phone), org.email, org.vatNumber ? `${t.vat} ${ltr(org.vatNumber)}` : null, ltr(`${q.number} V${v.versionNumber}`), t.page(p, n)].filter(Boolean).join("  ·  ")
  });

  header(d, t.title, [
    [t.number, q.number],
    [t.version, `V${v.versionNumber}`],
    [t.issue, dateStr(v.issueDate, lang)],
    [t.valid, dateStr(v.validUntil, lang)]
  ]);

  const contactName = q.contact ? `${q.contact.firstName} ${q.contact.lastName ?? ""}`.trim() : null;
  parties(
    d,
    {
      title: t.from,
      lines: [companyName, [org.address, org.city].filter(Boolean).join("، "), [ltr(org.phone), org.email].filter(Boolean).join("  ·  "), org.vatNumber ? `${t.vat}: ${ltr(org.vatNumber)}` : "", org.crNumber ? `${t.cr}: ${ltr(org.crNumber)}` : ""]
    },
    {
      title: t.to,
      lines: [
        q.client.displayName,
        contactName ? `${t.attn} ${contactName}${q.contact?.jobTitle ? ` — ${q.contact.jobTitle}` : ""}` : "",
        [q.client.address, q.client.city].filter(Boolean).join("، "),
        [q.contact?.email ?? q.client.email, ltr(q.contact?.phone ?? q.client.phone)].filter(Boolean).join("  ·  "),
        q.client.taxNumber ? `${t.vat}: ${ltr(q.client.taxNumber)}` : "",
        q.opportunity ? `${t.opp}: ${ltr(q.opportunity.number)}` : ""
      ]
    }
  );

  section(d, t.message, v.clientMessage);

  // ---- items table
  const cols: Column[] = [
    { key: "no", title: t.no, width: 22, align: "center" },
    { key: "item", title: t.item, width: 205 },
    { key: "qty", title: t.qty, width: 40, align: "center" },
    { key: "price", title: t.price, width: 68, align: "center" },
    { key: "disc", title: t.discount, width: 58, align: "center" },
    { key: "tax", title: t.tax, width: 42, align: "center" },
    { key: "total", title: t.total, width: 80, align: "center" }
  ];
  const xs = columnXs(d, cols);
  d.ensure(60);
  tableHeader(d, cols);
  v.items.forEach((it, i) => {
    d.font("semibold", 9);
    const nameH = d.measure(it.name, cols[1].width - 8);
    d.font("regular", 8);
    const descH = it.description ? d.measure(it.description, cols[1].width - 8, 1) : 0;
    const rowH = Math.max(nameH + descH, 14) + 10;
    d.ensure(rowH, () => tableHeader(d, cols));
    const y = d.y;
    d.font("regular", 8.5, COLORS.muted);
    d.text(String(i + 1), xs[0] + 4, y, cols[0].width - 8, { align: "center" });
    d.font("semibold", 9, COLORS.ink);
    let yy = d.text(it.name, xs[1] + 4, y, cols[1].width - 8);
    if (it.description) {
      d.font("regular", 8, COLORS.muted);
      yy = d.text(it.description, xs[1] + 4, yy, cols[1].width - 8, { lineGap: 1 });
    }
    d.font("regular", 8.5, COLORS.ink);
    d.text(`${qtyStr(it.quantity)}${it.unit ? ` ${it.unit}` : ""}`, xs[2] + 4, y, cols[2].width - 8, { align: "center" });
    d.text(num(it.unitPrice), xs[3] + 4, y, cols[3].width - 8, { align: "center" });
    d.text(it.discountType === "NONE" ? "—" : it.discountType === "PERCENT" ? `${num(it.discountValue)}%` : num(it.discountAmount), xs[4] + 4, y, cols[4].width - 8, { align: "center" });
    d.text(`${num(it.taxRate)}%`, xs[5] + 4, y, cols[5].width - 8, { align: "center" });
    d.font("semibold", 8.5, COLORS.ink);
    d.text(num(it.total), xs[6] + 4, y, cols[6].width - 8, { align: "center" });
    d.y = Math.max(yy, y + 14) + 6;
    d.hr(d.y - 3);
  });

  // ---- totals
  const rows: [string, string, boolean][] = [
    [t.subtotal, formatMoney(v.subtotal.toFixed(2), lang, v.currency), false],
    ...(v.discountTotal.gt(0) ? ([[t.discountTotal, formatMoney(v.discountTotal.toFixed(2), lang, v.currency), false]] as [string, string, boolean][]) : []),
    [t.vatTotal(num(v.vatRate)), formatMoney(v.taxTotal.toFixed(2), lang, v.currency), false],
    [t.grand, formatMoney(v.total.toFixed(2), lang, v.currency), true]
  ];
  d.ensure(rows.length * 18 + 30);
  d.y += 6;
  const boxW = 240;
  const boxX = rtl ? PAGE.m : PAGE.w - PAGE.m - boxW;
  for (const [k, val, strong] of rows) {
    if (strong) {
      d.pdf.rect(boxX, d.y - 4, boxW, 24).fill(COLORS.band);
      d.font("bold", 11, COLORS.ink);
    } else d.font("regular", 9, COLORS.muted);
    d.text(k, boxX + 8, d.y + (strong ? 1 : 0), boxW - 16, { align: "start" });
    if (!strong) d.font("semibold", 9, COLORS.ink);
    d.y = d.text(val, boxX + 8, d.y + (strong ? 1 : 0), boxW - 16, { align: "end" }) + (strong ? 8 : 4);
  }
  d.font("regular", 7.5, COLORS.faint);
  d.y = d.text(t.amountsIn(v.currency), boxX + 8, d.y, boxW - 16, { align: "end" }) + 14;

  section(d, t.payment, v.paymentTerms);
  section(d, t.delivery, v.deliveryTerms);
  section(d, t.terms, v.termsAndConditions);

  const out = await d.finish();
  return { ...out, language: lang, fileName: `${q.number}-V${v.versionNumber}-${lang}.pdf` };
}

/**
 * The file to hand out for a version: the stored artifact when the version was sent (exact
 * bytes the client received), otherwise a fresh render of the stored data.
 */
export async function quotationPdfFor(organizationId: string, versionId: string) {
  const stored = await prisma.commercialDocument.findFirst({ where: { organizationId, quotationVersionId: versionId, kind: "QUOTATION_PDF" }, orderBy: { createdAt: "asc" } });
  if (stored) return { data: Buffer.from(stored.data), sha256: stored.sha256, fileName: stored.fileName, stored: true };
  const r = await renderQuotationPdf(prisma, organizationId, versionId);
  return { data: r.data, sha256: r.sha256, fileName: r.fileName, stored: false };
}
