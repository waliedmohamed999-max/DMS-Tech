"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/os/action";
import { Field, Modal, useErrorText } from "@/components/os/client";
import { useHrRun, type FieldSpec } from "@/components/hr/Forms";

/**
 * Operations forms. Totals shown here are previews only — the server recalculates every amount.
 * Uploads are multipart POSTs to authorised route handlers (never server actions, never public paths).
 */

type AnyAction = (...args: never[]) => Promise<ActionResult<unknown>>;
export type Line = { description: string; quantity: string; price: string; discount?: string; taxRate?: string; assetExpected?: boolean; category?: string };

function HeaderField({ f, value, set }: { f: FieldSpec; value: string | boolean; set: (v: string | boolean) => void }) {
  if (f.type === "hidden") return null;
  if (f.type === "checkbox")
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(e.target.checked)} className="accent-[#624de3]" /> {f.label}
      </label>
    );
  return (
    <Field label={`${f.label}${f.required ? " *" : ""}`} hint={f.hint}>
      {f.type === "textarea" ? (
        <textarea className="os-input" rows={2} dir={f.dir ?? "auto"} value={String(value ?? "")} onChange={(e) => set(e.target.value)} />
      ) : f.type === "select" ? (
        <select className="os-input" value={String(value ?? "")} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input className="os-input" type={f.type === "number" ? "text" : f.type ?? "text"} inputMode={f.type === "number" ? "decimal" : undefined} dir={f.dir ?? (["email", "number", "date"].includes(f.type ?? "") ? "ltr" : undefined)} value={String(value ?? "")} onChange={(e) => set(e.target.value)} />
      )}
    </Field>
  );
}

const num = (s: string | undefined) => {
  const n = Number(String(s ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Header fields + editable lines (procurement request or purchase order). */
export function LinesForm({
  action, args = [], header, kind, lines: initial, defaultTaxRate = "15", currency, trigger, triggerClass, submitLabel, submitAndSendLabel, redirect, autoOpen, onCloseHref, title
}: {
  action: AnyAction; args?: unknown[]; header: FieldSpec[]; kind: "request" | "order"; lines?: Line[]; defaultTaxRate?: string; currency: string;
  trigger: string; triggerClass?: string; submitLabel: string; submitAndSendLabel?: string; redirect?: string; autoOpen?: boolean; onCloseHref?: string; title?: string;
}) {
  const t = useTranslations("os.ops");
  const tc = useTranslations("os.hr");
  const router = useRouter();
  const { pending, error, run, setError } = useHrRun();
  const [open, setOpen] = useState(Boolean(autoOpen));
  const saved = useRef(false);
  const blank = (): Line => ({ description: "", quantity: "1", price: "", discount: "0", taxRate: defaultTaxRate, assetExpected: false });
  const [v, setV] = useState<Record<string, string | boolean>>(() => Object.fromEntries(header.map((f) => [f.name, (f.value as string | boolean | undefined) ?? (f.type === "checkbox" ? false : "")])));
  const [lines, setLines] = useState<Line[]>(initial?.length ? initial : [blank()]);
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const calc = lines.map((l) => {
    const sub = Math.max(0, num(l.quantity) * num(l.price) - (kind === "order" ? num(l.discount) : 0));
    const tax = kind === "order" ? (sub * num(l.taxRate)) / 100 : 0;
    return { sub, tax };
  });
  const total = calc.reduce((s, c) => s + c.sub + c.tax, 0);
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const close = () => {
    setOpen(false);
    setError(null);
    if (onCloseHref && !saved.current) router.replace(onCloseHref);
  };
  const missing = header.some((f) => f.required && !v[f.name]) || lines.some((l) => !l.description.trim() || !num(l.quantity));
  const submit = (send: boolean) =>
    run(
      () => {
        const items = lines.map((l) =>
          kind === "request"
            ? { description: l.description, quantity: l.quantity, estimatedUnitPrice: l.price || "0", assetExpected: Boolean(l.assetExpected), category: l.category ?? "" }
            : { description: l.description, quantity: l.quantity, unitPrice: l.price || "0", discountAmount: l.discount || "0", taxRate: l.taxRate ?? defaultTaxRate, assetExpected: Boolean(l.assetExpected), category: l.category ?? "" }
        );
        const call = action as unknown as (...a: unknown[]) => Promise<ActionResult<unknown>>;
        return call(...args, { ...v, items, ...(kind === "request" ? { submit: send } : {}) });
      },
      (r) => {
        saved.current = true;
        setOpen(false);
        const id = r.ok ? (r.data as { id?: string } | undefined)?.id : undefined;
        if (redirect && id) router.push(redirect.replace(":id", id));
      }
    );
  return (
    <>
      <button type="button" className={triggerClass ?? "os-btn-primary"} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <Modal open={open} onClose={close} title={title ?? trigger} wide>
        <div className="grid gap-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            {header.map((f) => (
              <div key={f.name} className={f.type === "textarea" || f.span ? "sm:col-span-2" : ""}>
                <HeaderField f={f} value={v[f.name] as string | boolean} set={(x) => setV({ ...v, [f.name]: x })} />
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            <p className="os-label">{t("lines")}</p>
            {lines.map((l, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-os-line p-2 sm:grid-cols-[minmax(0,2fr)_80px_110px_repeat(2,90px)_auto]">
                <input className="os-input" aria-label={t("f.description")} placeholder={t("f.description")} dir="auto" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                <input className="os-input" aria-label={t("f.quantity")} placeholder={t("f.quantity")} dir="ltr" inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <input className="os-input" aria-label={kind === "request" ? t("f.estUnitPrice") : t("f.unitPrice")} placeholder={kind === "request" ? t("f.estUnitPrice") : t("f.unitPrice")} dir="ltr" inputMode="decimal" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} />
                {kind === "order" ? (
                  <>
                    <input className="os-input" aria-label={t("f.discount")} placeholder={t("f.discount")} dir="ltr" inputMode="decimal" value={l.discount ?? ""} onChange={(e) => setLine(i, { discount: e.target.value })} />
                    <input className="os-input" aria-label={t("f.taxRate")} placeholder={t("f.taxRate")} dir="ltr" inputMode="decimal" value={l.taxRate ?? ""} onChange={(e) => setLine(i, { taxRate: e.target.value })} />
                  </>
                ) : (
                  <span className="hidden sm:col-span-2 sm:block" />
                )}
                <span className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[11px] text-os-muted">
                    <input type="checkbox" className="accent-[#624de3]" checked={Boolean(l.assetExpected)} onChange={(e) => setLine(i, { assetExpected: e.target.checked })} /> {t("f.assetExpected")}
                  </label>
                  {lines.length > 1 && (
                    <button type="button" className="os-btn-ghost h-7 px-2 text-xs" aria-label="remove" onClick={() => setLines(lines.filter((_, n) => n !== i))}>
                      ✕
                    </button>
                  )}
                </span>
                <span className="text-[11px] text-os-faint sm:col-span-6" dir="ltr">
                  {fmt(calc[i].sub)}
                  {kind === "order" ? ` + ${fmt(calc[i].tax)}` : ""} {currency}
                </span>
              </div>
            ))}
            <button type="button" className="os-btn-ghost justify-self-start text-xs" onClick={() => setLines([...lines, blank()])}>
              + {t("addLine")}
            </button>
          </div>
          <p className="flex items-center justify-between border-t border-os-line pt-2 text-sm">
            <span className="text-os-muted">{t("previewTotal")}</span>
            <span className="font-semibold tabular" dir="ltr">
              {fmt(total)} {currency}
            </span>
          </p>
          <p className="text-[11px] text-os-faint">{t("serverTotalsNote")}</p>
          {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={close}>
              {tc("cancel")}
            </button>
            <button type="button" className={submitAndSendLabel ? "os-btn-secondary" : "os-btn-primary"} disabled={pending || missing} onClick={() => submit(false)}>
              {submitLabel}
            </button>
            {submitAndSendLabel && (
              <button type="button" className="os-btn-primary" disabled={pending || missing} onClick={() => submit(true)}>
                {submitAndSendLabel}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Goods / service receipt: quantities per open line (server refuses over-receipt). */
export function ReceiveForm({ action, poId, lines, today }: { action: AnyAction; poId: string; lines: { id: string; description: string; remaining: string }[]; today: string }) {
  const t = useTranslations("os.ops");
  const tc = useTranslations("os.hr");
  const { pending, error, run, setError } = useHrRun();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(() => lines.map((l) => ({ poItemId: l.id, quantity: l.remaining, condition: "GOOD", notes: "" })));
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  return (
    <>
      <button type="button" className="os-btn-primary" onClick={() => setOpen(true)}>
        {t("a.receive")}
      </button>
      <Modal open={open} onClose={() => (setOpen(false), setError(null))} title={t("a.receive")} wide>
        <div className="grid gap-3 text-sm">
          <p className="text-xs text-os-muted">{t("receiveNote")}</p>
          {lines.map((l, i) => (
            <div key={l.id} className="grid items-end gap-2 rounded-lg border border-os-line p-2 sm:grid-cols-[minmax(0,1fr)_110px_140px]">
              <p className="text-sm">
                {l.description}
                <span className="block text-[11px] text-os-faint">
                  {t("remaining")}: <span dir="ltr">{l.remaining}</span>
                </span>
              </p>
              <Field label={t("f.quantity")}>
                <input className="os-input" dir="ltr" inputMode="decimal" value={rows[i].quantity} onChange={(e) => setRows(rows.map((r, n) => (n === i ? { ...r, quantity: e.target.value } : r)))} />
              </Field>
              <Field label={t("f.condition")}>
                <select className="os-input" value={rows[i].condition} onChange={(e) => setRows(rows.map((r, n) => (n === i ? { ...r, condition: e.target.value } : r)))}>
                  {["GOOD", "DAMAGED", "INCORRECT"].map((c) => (
                    <option key={c} value={c}>
                      {t(`cond.${c}` as "cond.GOOD")}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("f.receivedAt")}>
              <input className="os-input" type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t("f.notes")}>
              <input className="os-input" dir="auto" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
          {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </button>
            <button
              type="button"
              className="os-btn-primary"
              disabled={pending}
              onClick={() =>
                run(() => (action as unknown as (...a: unknown[]) => Promise<ActionResult<unknown>>)(poId, { receivedAt: date, notes, lines: rows.filter((r) => num(r.quantity) > 0) }), () => setOpen(false))
              }
            >
              {t("a.recordReceipt")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/**
 * Secure upload (new document or new version). The file goes to an authorised route handler as multipart;
 * the server validates type, extension, content signature and size, stores it outside public/ and hashes it.
 */
export function UploadForm({
  endpoint, fields, trigger, triggerClass, title, redirectTo, note
}: { endpoint: string; fields: FieldSpec[]; trigger: string; triggerClass?: string; title?: string; redirectTo?: string; note?: string }) {
  const t = useTranslations("os.ops");
  const tc = useTranslations("os.hr");
  const errText = useErrorText();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [v, setV] = useState<Record<string, string | boolean>>(() => Object.fromEntries(fields.map((f) => [f.name, (f.value as string | boolean | undefined) ?? ""])));
  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    for (const [k, x] of Object.entries(v)) fd.set(k, String(x ?? ""));
    const res = await fetch(endpoint, { method: "POST", body: fd }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { ok?: boolean; id?: string; error?: string; detail?: string } | null;
    setBusy(false);
    if (!res || !body?.ok) {
      const c = body?.error ?? "UNKNOWN";
      return setError(t.has(`errors.${c}`) ? t(`errors.${c}` as "errors.OVER_RECEIPT") : errText(c));
    }
    setOpen(false);
    setFile(null);
    if (redirectTo && body.id) router.push(redirectTo.replace(":id", body.id));
    else router.refresh();
  };
  return (
    <>
      <button type="button" className={triggerClass ?? "os-btn-primary"} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <Modal open={open} onClose={() => (setOpen(false), setError(null))} title={title ?? trigger} wide={fields.length > 3}>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          {note && <p className="text-xs text-os-muted sm:col-span-2">{note}</p>}
          <div className="sm:col-span-2">
            <Field label={`${t("f.file")} *`} hint={t("fileHint")}>
              <input className="os-input py-1.5" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx,.txt,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
          </div>
          {fields.map((f) => (
            <div key={f.name} className={f.type === "textarea" || f.span ? "sm:col-span-2" : ""}>
              <HeaderField f={f} value={v[f.name] as string | boolean} set={(x) => setV({ ...v, [f.name]: x })} />
            </div>
          ))}
          {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={busy || !file || fields.some((f) => f.required && !v[f.name])} onClick={submit}>
              {busy ? "…" : t("a.upload")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Ticket note: internal (staff only) or requester-facing marker (nothing is sent outside the OS). */
export function CommentBox({ action, ticketId, staff }: { action: AnyAction; ticketId: string; staff: boolean }) {
  const t = useTranslations("os.ops");
  const { pending, error, run } = useHrRun();
  const [body, setBody] = useState("");
  const [vis, setVis] = useState(staff ? "INTERNAL" : "CLIENT_FACING");
  return (
    <div className="grid gap-2 border-t border-os-line p-3">
      <textarea className="os-input" rows={3} dir="auto" placeholder={t("commentPlaceholder")} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        {staff && (
          <select className="os-input h-8 w-auto py-0 text-xs" value={vis} onChange={(e) => setVis(e.target.value)} aria-label={t("f.visibility")}>
            <option value="INTERNAL">{t("cvis.INTERNAL")}</option>
            <option value="CLIENT_FACING">{t("cvis.CLIENT_FACING")}</option>
          </select>
        )}
        <span className="flex-1 text-[11px] text-os-faint">{vis === "CLIENT_FACING" ? t("clientFacingNote") : t("internalNote")}</span>
        <button type="button" className="os-btn-primary h-8 px-3 text-xs" disabled={pending || !body.trim()} onClick={() => run(() => (action as unknown as (...a: unknown[]) => Promise<ActionResult<unknown>>)(ticketId, { body, visibility: vis }), () => setBody(""))}>
          {t("a.addNote")}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
