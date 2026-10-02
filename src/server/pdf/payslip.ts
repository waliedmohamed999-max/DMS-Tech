import { prisma } from "../db";
import { formatMoney } from "@/lib/commercial/calc";
import { COLORS, PAGE, createDoc, header, section } from "./doc";
import { ltr } from "./text";
import type { PayrollEntry, PayrollPeriod } from "@/generated/prisma/client";

/**
 * Payslip PDF — rendered only from the frozen PayrollEntry snapshot (never from current salary).
 * Shows earnings / deductions / gross / net; no bank account, no personal contact data.
 */

const L = {
  ar: { title: "قسيمة راتب", period: "الفترة", pay: "تاريخ الصرف", employee: "الموظف", number: "الرقم الوظيفي", job: "المسمى", dept: "القسم", earnings: "الاستحقاقات", deductions: "الاستقطاعات", gross: "إجمالي الاستحقاقات", totalDed: "إجمالي الاستقطاعات", net: "صافي الراتب", none: "لا يوجد", confidential: "سري — للموظف فقط", page: (p: number, n: number) => `صفحة ${p} من ${n}`, prorated: (a: number, b: number) => `محسوب بالتناسب: ${a} من ${b} يومًا` },
  en: { title: "PAYSLIP", period: "Period", pay: "Pay date", employee: "Employee", number: "Employee no.", job: "Job title", dept: "Department", earnings: "Earnings", deductions: "Deductions", gross: "Gross pay", totalDed: "Total deductions", net: "Net pay", none: "None", confidential: "Confidential — for the employee only", page: (p: number, n: number) => `Page ${p} of ${n}`, prorated: (a: number, b: number) => `Prorated: ${a} of ${b} days` }
};
const dateStr = (d: Date, lang: "ar" | "en") => new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);

export async function renderPayslip(organizationId: string, entry: PayrollEntry & { period: PayrollPeriod }, lang: "ar" | "en") {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const t = L[lang];
  const rtl = lang === "ar";
  const company = (rtl ? org.nameAr : null) ?? org.legalName ?? org.name;
  const d = createDoc({ rtl, title: `${t.title} ${entry.period.name}`, footer: (p, n) => [company, t.confidential, ltr(entry.employeeNumber), t.page(p, n)].join("  ·  ") });
  header(d, t.title, [
    [t.period, `${dateStr(entry.period.periodStart, lang)} – ${dateStr(entry.period.periodEnd, lang)}`],
    [t.pay, dateStr(entry.period.payDate, lang)]
  ]);
  const name = (rtl && entry.employeeNameAr) || entry.employeeName;
  const info: [string, string][] = [[t.employee, name], [t.number, ltr(entry.employeeNumber)], [t.job, entry.jobTitle ?? "—"], [t.dept, (rtl && entry.departmentNameAr) || entry.departmentName || "—"]];
  d.font("regular", 9.5);
  for (const [k, v] of info) {
    d.font("regular", 9, COLORS.muted);
    d.text(k, PAGE.m, d.y, 120, { align: "start" });
    d.font("semibold", 9.5, COLORS.ink);
    d.y = d.text(v, PAGE.m + (rtl ? 0 : 130), d.y, d.cw - 130, { align: rtl ? "end" : "start" }) + 4;
  }
  d.y += 8;
  const m = (v: string) => formatMoney(v, lang, entry.currency);
  const lines = entry.lines as { key: string; nameAr: string; nameEn: string; kind: string; amount: string; reason?: string }[];
  const block = (title: string, rows: typeof lines) => {
    d.ensure(40 + rows.length * 16);
    d.pdf.rect(PAGE.m, d.y - 2, d.cw, 20).fill(COLORS.band);
    d.font("bold", 10, COLORS.ink);
    d.y = d.text(title, PAGE.m + 8, d.y + 2, d.cw - 16) + 8;
    if (!rows.length) {
      d.font("regular", 9, COLORS.faint);
      d.y = d.text(t.none, PAGE.m + 8, d.y, d.cw - 16) + 6;
    }
    for (const r of rows) {
      d.font("regular", 9.5, COLORS.ink);
      const label = `${rtl ? r.nameAr : r.nameEn}${r.reason ? ` — ${r.reason}` : ""}`;
      d.text(label, PAGE.m + 8, d.y, d.cw - 160, { align: "start" });
      d.font("semibold", 9.5, COLORS.ink);
      d.y = d.text(m(r.amount), PAGE.m + 8, d.y, d.cw - 16, { align: "end" }) + 5;
      d.hr(d.y - 2);
    }
    d.y += 8;
  };
  block(t.earnings, lines.filter((l) => l.kind === "EARNING"));
  block(t.deductions, lines.filter((l) => l.kind === "DEDUCTION"));
  const totals: [string, string, boolean][] = [[t.gross, m(entry.grossPay.toFixed(2)), false], [t.totalDed, m(entry.totalDeductions.toFixed(2)), false], [t.net, m(entry.netPay.toFixed(2)), true]];
  const boxW = 260;
  const boxX = rtl ? PAGE.m : PAGE.w - PAGE.m - boxW;
  for (const [k, v, strong] of totals) {
    if (strong) {
      d.pdf.rect(boxX, d.y - 4, boxW, 26).fill(COLORS.band);
      d.font("bold", 12, COLORS.ink);
    } else d.font("regular", 9.5, COLORS.muted);
    d.text(k, boxX + 8, d.y + (strong ? 2 : 0), boxW - 16, { align: "start" });
    if (!strong) d.font("semibold", 9.5, COLORS.ink);
    d.y = d.text(v, boxX + 8, d.y + (strong ? 2 : 0), boxW - 16, { align: "end" }) + (strong ? 10 : 5);
  }
  const meta = entry.calculationMeta as { prorated?: boolean; activeDays?: number; periodDays?: number };
  if (meta?.prorated && meta.activeDays && meta.periodDays) section(d, "", t.prorated(meta.activeDays, meta.periodDays));
  const out = await d.finish();
  return { ...out, fileName: `payslip-${entry.employeeNumber}-${entry.period.name}-${lang}.pdf` };
}
