import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import PDFDocument from "pdfkit";
import { drawText, lineWidth, measureText } from "./text";

/**
 * Shared document primitives for commercial PDFs.
 *
 * Production-safe: fonts (IBM Plex Sans Arabic, OFL) and the logo are files inside the
 * repository (assets/fonts, public/images), resolved from the app root and included in the
 * server bundle via `outputFileTracingIncludes` (next.config.mjs). No system fonts, no
 * headless browser.
 */

// statically scoped paths (so the bundler traces only these files, see next.config.mjs)
const FONT_REGULAR = path.join(process.cwd(), "assets", "fonts", "IBMPlexSansArabic-Regular.ttf");
const FONT_SEMIBOLD = path.join(process.cwd(), "assets", "fonts", "IBMPlexSansArabic-SemiBold.ttf");
const FONT_BOLD = path.join(process.cwd(), "assets", "fonts", "IBMPlexSansArabic-Bold.ttf");
const LOGO = path.join(process.cwd(), "assets", "brand", "logo-print.png"); // 480px palette PNG (~17 KB) of public/images/logo.png
let cache: { regular: Buffer; semibold: Buffer; bold: Buffer; logo: Buffer | null } | null = null;
function assets() {
  cache ??= {
    regular: fs.readFileSync(FONT_REGULAR),
    semibold: fs.readFileSync(FONT_SEMIBOLD),
    bold: fs.readFileSync(FONT_BOLD),
    logo: fs.existsSync(LOGO) ? fs.readFileSync(LOGO) : null
  };
  return cache;
}

export const COLORS = { ink: "#14161a", muted: "#5f6670", faint: "#9aa1ab", line: "#e3e6ea", brand: "#a8742f", band: "#f6f4f0", danger: "#b42318" };
export const PAGE = { w: 595.28, h: 841.89, m: 40 };

export type Doc = {
  pdf: PDFKit.PDFDocument;
  rtl: boolean;
  y: number;
  /** content width */
  cw: number;
  font(kind: "regular" | "semibold" | "bold", size: number, color?: string): void;
  /** text block at x/width; returns new y */
  text(t: string, x: number, y: number, width: number, opts?: { align?: "start" | "end" | "center"; lineGap?: number }): number;
  measure(t: string, width: number, lineGap?: number): number;
  width(t: string): number;
  /** logical "start" x for a box of `width` inside [x, x+w] (mirrors for RTL) */
  ensure(space: number, onNewPage?: () => void): void;
  hr(y?: number, color?: string): void;
  finish(): Promise<{ data: Buffer; sha256: string }>;
};

export function createDoc(opts: { rtl: boolean; title: string; footer: (page: number, pages: number) => string; watermark?: string | null }): Doc {
  const a = assets();
  const pdf = new PDFDocument({ size: "A4", margin: PAGE.m, bufferPages: true, info: { Title: opts.title, Author: "DMS Tech", Creator: "DMS Business OS" } });
  pdf.registerFont("regular", a.regular);
  pdf.registerFont("semibold", a.semibold);
  pdf.registerFont("bold", a.bold);
  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => pdf.on("end", () => resolve(Buffer.concat(chunks))));

  const d: Doc = {
    pdf,
    rtl: opts.rtl,
    y: PAGE.m,
    cw: PAGE.w - PAGE.m * 2,
    font(kind, size, color = COLORS.ink) {
      pdf.font(kind).fontSize(size).fillColor(color);
    },
    text(t, x, y, width, o = {}) {
      return drawText(pdf, t ?? "", x, y, { width, rtl: opts.rtl, align: o.align, lineGap: o.lineGap });
    },
    measure(t, width, lineGap) {
      return measureText(pdf, t ?? "", width, lineGap);
    },
    width(t) {
      return lineWidth(pdf, t);
    },
    ensure(space, onNewPage) {
      if (d.y + space > PAGE.h - PAGE.m - 30) {
        pdf.addPage();
        d.y = PAGE.m;
        onNewPage?.();
      }
    },
    hr(y = d.y, color = COLORS.line) {
      pdf.moveTo(PAGE.m, y).lineTo(PAGE.w - PAGE.m, y).lineWidth(0.7).strokeColor(color).stroke();
    },
    async finish() {
      const range = pdf.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        pdf.switchToPage(i);
        if (opts.watermark) {
          pdf.save();
          pdf.rotate(-30, { origin: [PAGE.w / 2, PAGE.h / 2] });
          d.font("bold", 54, "#d92d20");
          pdf.opacity(0.09);
          drawText(pdf, opts.watermark, 0, PAGE.h / 2 - 30, { width: PAGE.w, rtl: opts.rtl, align: "center" });
          pdf.opacity(1);
          pdf.restore();
        }
        const fy = PAGE.h - PAGE.m + 6;
        pdf.moveTo(PAGE.m, fy - 6).lineTo(PAGE.w - PAGE.m, fy - 6).lineWidth(0.5).strokeColor(COLORS.line).stroke();
        d.font("regular", 7.5, COLORS.faint);
        // pdfkit would add a page if we wrote below the bottom margin
        const bottom = pdf.page.margins.bottom;
        pdf.page.margins.bottom = 0;
        drawText(pdf, opts.footer(i - range.start + 1, range.count), PAGE.m, fy, { width: d.cw, rtl: opts.rtl, align: "center" });
        pdf.page.margins.bottom = bottom;
      }
      pdf.end();
      const data = await done;
      return { data, sha256: createHash("sha256").update(data).digest("hex") };
    }
  };
  d.font("regular", 10);
  return d;
}

/** Brand header: logo on the start side, document title + meta on the end side. Returns y below. */
export function header(d: Doc, title: string, meta: [string, string][]) {
  const { pdf, rtl } = d;
  const a = assets();
  const logoW = 120;
  const top = PAGE.m;
  if (a.logo) pdf.image(a.logo, rtl ? PAGE.w - PAGE.m - logoW : PAGE.m, top, { width: logoW });
  const boxW = 230;
  const boxX = rtl ? PAGE.m : PAGE.w - PAGE.m - boxW;
  d.font("bold", 18, COLORS.ink);
  let y = d.text(title, boxX, top - 2, boxW, { align: "end" });
  y += 2;
  for (const [k, v] of meta) {
    // label at the start edge of the box, value at the end edge, same baseline
    d.font("regular", 8.5, COLORS.muted);
    d.text(k, boxX, y, boxW, { align: "start" });
    d.font("semibold", 8.5, COLORS.ink);
    y = d.text(v, boxX, y, boxW, { align: "end" });
  }
  d.y = Math.max(y, top + 50) + 10;
  d.hr(d.y, COLORS.brand);
  d.y += 14;
}

/** Two side-by-side information blocks (e.g. "From" / "Bill to"). */
export function parties(d: Doc, left: { title: string; lines: string[] }, right: { title: string; lines: string[] }) {
  const gap = 24;
  const w = (d.cw - gap) / 2;
  const blocks = d.rtl ? [left, right] : [left, right];
  const xs = d.rtl ? [PAGE.m + w + gap, PAGE.m] : [PAGE.m, PAGE.m + w + gap];
  let maxY = d.y;
  blocks.forEach((b, i) => {
    let y = d.y;
    d.font("semibold", 8, COLORS.brand);
    y = d.text(b.title.toUpperCase(), xs[i], y, w);
    d.font("bold", 10.5, COLORS.ink);
    y = d.text(b.lines[0] ?? "", xs[i], y + 1, w);
    d.font("regular", 8.5, COLORS.muted);
    for (const l of b.lines.slice(1).filter(Boolean)) y = d.text(l, xs[i], y, w, { lineGap: 1 });
    maxY = Math.max(maxY, y);
  });
  d.y = maxY + 14;
}

/** Titled paragraph section; skipped when empty. */
export function section(d: Doc, title: string, body: string | null | undefined) {
  if (!body?.trim()) return;
  d.font("regular", 9);
  const h = d.measure(body, d.cw) + 22;
  d.ensure(Math.min(h, 120));
  d.font("semibold", 9.5, COLORS.ink);
  d.y = d.text(title, PAGE.m, d.y, d.cw);
  d.y += 2;
  d.font("regular", 9, COLORS.muted);
  for (const para of body.split("\n")) {
    d.font("regular", 9, COLORS.muted);
    const ph = d.measure(para || " ", d.cw, 1.5);
    d.ensure(ph);
    d.font("regular", 9, COLORS.muted);
    d.y = d.text(para || " ", PAGE.m, d.y, d.cw, { lineGap: 1.5 });
  }
  d.y += 10;
}

export type Column = { key: string; title: string; width: number; align?: "start" | "end" | "center" };

/** x position of each column (logical order → visual, mirrored for RTL). */
export function columnXs(d: Doc, cols: Column[]) {
  const xs: number[] = [];
  let acc = 0;
  for (const c of cols) {
    xs.push(d.rtl ? PAGE.w - PAGE.m - acc - c.width : PAGE.m + acc);
    acc += c.width;
  }
  return xs;
}

export function tableHeader(d: Doc, cols: Column[]) {
  const xs = columnXs(d, cols);
  d.pdf.rect(PAGE.m, d.y, d.cw, 20).fill(COLORS.band);
  d.font("semibold", 8, COLORS.muted);
  cols.forEach((c, i) => d.text(c.title, xs[i] + 4, d.y + 5, c.width - 8, { align: c.align ?? "start" }));
  d.y += 24;
}

export const pad = 4;
