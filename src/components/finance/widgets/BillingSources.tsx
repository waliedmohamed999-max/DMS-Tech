"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createInvoiceFromSourceAction } from "@/lib/os/finance-actions";
import { Money, useFinRun } from "../shared";
import { Err } from "./shared";

// ---------------------------------------------------------------------------
// Billing sources
// ---------------------------------------------------------------------------

export type CandidateView = { type: string; id: string; label: string; ref: string; clientName: string; eligible: boolean; reasons: string[]; blockers: { code: string; params?: Record<string, string | number> }[]; amount: string | null; currency: string; meta?: Record<string, string | number | null> };

export function SourceList({ items, highlight }: { items: CandidateView[]; highlight?: string }) {
  const t = useTranslations("os.finance");
  const router = useRouter();
  const { pending, error, run } = useFinRun();
  const [busy, setBusy] = useState<string | null>(null);
  if (!items.length) return <p className="px-4 py-6 text-center text-sm text-os-muted">{t("noSources")}</p>;
  return (
    <div className="grid">
      {error && (
        <div className="p-3">
          <Err e={error} />
        </div>
      )}
      <ul className="divide-y divide-os-line">
        {items.map((c) => (
          <li key={`${c.type}-${c.id}`} className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm ${highlight === c.id ? "bg-iris/5" : ""}`}>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-os-line px-1.5 text-[10.5px] text-os-muted">{t(`source.${c.type}` as "source.MANUAL")}</span>
                <span className="font-medium">{c.label}</span>
              </p>
              <p className="mt-0.5 text-[11px] text-os-faint">
                <span dir="ltr">{c.ref}</span> · {c.clientName}
                {c.meta?.minutes ? ` · ${Math.round(Number(c.meta.minutes) / 6) / 10}h` : ""}
              </p>
              <p className="mt-1 flex flex-wrap gap-1 text-[11px]">
                {c.reasons.map((r) => (
                  <span key={r} className="text-success">
                    ✓ {t(`reason.${r}` as "reason.MILESTONE_DUE")}
                  </span>
                ))}
                {c.blockers.map((b) => (
                  <span key={b.code} className="text-warning">
                    ⛔ {t(`blocker.${b.code}` as "blocker.ALREADY_INVOICED", { number: "", due: "", ...(b.params ?? {}) })}
                  </span>
                ))}
              </p>
            </div>
            {c.amount !== null && <Money v={c.amount} currency={c.currency} className="text-sm font-semibold" />}
            <button
              type="button"
              className={c.eligible ? "os-btn-primary h-8 px-3 text-xs" : "os-btn-secondary h-8 px-3 text-xs"}
              disabled={!c.eligible || pending}
              onClick={() => {
                setBusy(c.id);
                run(() => createInvoiceFromSourceAction({ type: c.type, id: c.id }), (r) => r.ok && router.push(`/app/finance/invoices/${(r.data as { id: string }).id}`));
              }}
            >
              {pending && busy === c.id ? "…" : t("createInvoice")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
