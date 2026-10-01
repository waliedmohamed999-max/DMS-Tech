import bidiFactory from "bidi-js";
import type PDFDocument from "pdfkit";

/**
 * Minimal bidirectional text layout for pdfkit.
 *
 * pdfkit shapes Arabic through fontkit (joining forms) and lays out each string as one
 * run, reversing glyphs for right-to-left scripts. It does NOT run the Unicode bidi
 * algorithm, so a mixed line such as "عرض سعر Q-2026-000001 بقيمة 1,150.00 SAR" would come
 * out scrambled. Here we:
 *   1. wrap words in logical order using real glyph widths,
 *   2. split each line into runs of equal bidi embedding level (bidi-js, UAX #9),
 *   3. reorder the runs visually (rule L2) and draw them one by one.
 * Each run keeps its logical text so fontkit can still shape Arabic correctly.
 */

const bidi = bidiFactory();
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export const hasArabic = (s: string) => ARABIC.test(s);

/** Left-to-right isolate (UAX #9 LRI…PDI): keeps "+966…", "15%" or codes intact inside Arabic text. */
const LRI = "\u2066";
const PDI = "\u2069";
export const ltr = (s: string | null | undefined) => (s ? `${LRI}${s}${PDI}` : "");
const ISOLATES = /[\u2066-\u2069]/g;
const clean = (s: string) => s.replace(ISOLATES, "");

type Run = { text: string; level: number };

export function runsOf(line: string, rtlBase: boolean): Run[] {
  if (!line) return [];
  const { levels } = bidi.getEmbeddingLevels(line, rtlBase ? "rtl" : "ltr");
  const runs: Run[] = [];
  let start = 0;
  for (let i = 1; i <= line.length; i++) {
    if (i === line.length || levels[i] !== levels[start]) {
      runs.push({ text: line.slice(start, i), level: levels[start] });
      start = i;
    }
  }
  // L2: from the highest level down to the lowest odd level, reverse every maximal
  // sequence of runs at that level or above
  const max = Math.max(...runs.map((r) => r.level));
  const minOdd = Math.min(...runs.map((r) => r.level).filter((l) => l % 2 === 1), max + 1);
  for (let lvl = max; lvl >= minOdd && lvl > 0; lvl--) {
    for (let i = 0; i < runs.length; ) {
      if (runs[i].level >= lvl) {
        let j = i;
        while (j < runs.length && runs[j].level >= lvl) j++;
        const seg = runs.slice(i, j).reverse();
        runs.splice(i, j - i, ...seg);
        i = j;
      } else i++;
    }
  }
  return runs.map((r) => {
    if (r.level % 2 === 0) return r;
    // right-to-left run: mirror brackets; runs without Arabic letters are not reversed by
    // fontkit (it picks direction from the script), so reverse their characters here
    const mirrored = [...r.text].map((ch) => MIRROR[ch] ?? ch);
    // neutral-only RTL runs (e.g. ") " or " - ") are reversed character-wise; tokens are
    // reordered later by drawText
    return { text: hasArabic(r.text) ? mirrored.join("") : r.text.trim() ? mirrored.join("") : mirrored.reverse().join(""), level: r.level };
  });
}

const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "«": "»", "»": "«" };

/** Split text into lines that fit `width` (logical order). Honors explicit newlines. */
export function wrap(doc: PDFKit.PDFDocument, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r/g, "").split("\n")) {
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line = "";
    for (const w of words) {
      const next = line + w;
      if (line && doc.widthOfString(clean(next.trimEnd())) > width) {
        out.push(line.trimEnd());
        line = w.trimStart();
        // a single word longer than the line: hard-break by characters
        while (doc.widthOfString(clean(line)) > width && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && doc.widthOfString(clean(line.slice(0, cut))) > width) cut--;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else line = next;
    }
    out.push(line.trimEnd());
  }
  return out;
}

export type TextOpts = { width: number; align?: "start" | "end" | "center"; rtl: boolean; lineGap?: number };

/**
 * Draw (possibly multi-line, mixed-direction) text in a box starting at (x, y).
 * `align: "start"` means right edge for RTL documents and left edge for LTR.
 * Returns the y position after the last line.
 */
export function drawText(doc: PDFKit.PDFDocument, text: string, x: number, y: number, o: TextOpts): number {
  const lineHeight = doc.currentLineHeight(true) + (o.lineGap ?? 2);
  // whitespace width measured between two glyphs (pdfkit trims bare spaces)
  const space = doc.widthOfString("a a") - doc.widthOfString("aa");
  const tokenWidth = (t: string) => (/^\s+$/.test(t) ? space * t.length : doc.widthOfString(clean(t)));
  let cy = y;
  for (const line of wrap(doc, text ?? "", o.width)) {
    // visual pieces: runs in visual order; inside a right-to-left run the words are laid
    // out right-to-left here (fontkit only reverses glyphs within each word reliably)
    const pieces: string[] = [];
    for (const r of runsOf(line, o.rtl)) {
      const tokens = clean(r.text).split(/(\s+)/).filter(Boolean);
      pieces.push(...(r.level % 2 === 1 ? tokens.reverse() : tokens));
    }
    const widths = pieces.map(tokenWidth);
    const total = widths.reduce((a, b) => a + b, 0);
    const align = o.align ?? "start";
    const left = align === "center" ? x + (o.width - total) / 2 : (align === "start") === o.rtl ? x + o.width - total : x;
    let cx = left;
    pieces.forEach((p, i) => {
      if (!/^\s+$/.test(p)) doc.text(p, cx, cy, { lineBreak: false });
      cx += widths[i];
    });
    cy += lineHeight;
  }
  return cy;
}

/** Width of a single line of mixed text (for right-aligned columns). */
export function lineWidth(doc: PDFKit.PDFDocument, text: string): number {
  const space = doc.widthOfString("a a") - doc.widthOfString("aa");
  return clean(text).split(/(\s+)/).filter(Boolean).reduce((w, t) => w + (/^\s+$/.test(t) ? space * t.length : doc.widthOfString(t)), 0);
}

/** Height a block of text would take without drawing it. */
export function measureText(doc: PDFKit.PDFDocument, text: string, width: number, lineGap = 2): number {
  return wrap(doc, text ?? "", width).length * (doc.currentLineHeight(true) + lineGap);
}

export type { PDFDocument };
