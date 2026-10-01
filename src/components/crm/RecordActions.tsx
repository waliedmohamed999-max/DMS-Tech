"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { archiveClientAction, archiveLeadAction, archiveOpportunityAction, deleteViewAction, markLeadLostAction, markOppLostAction, markWonAction, qualifyLeadAction, reopenLeadAction, saveViewAction } from "@/lib/os/crm-actions";
import type { ActionResult } from "@/lib/os/action";
import { useErrorText } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";
import { LostReasonDialog } from "./CrmForms";

function useRun() {
  const router = useRouter();
  const err = useErrorText();
  const tc = useTranslations("os.crm.errors");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setError(undefined);
        after?.();
        router.refresh();
      } else setError(tc.has(r.error) ? tc(r.error as "LOST_REASON_REQUIRED") : err(r.error));
    });
  return { pending, error, run };
}

export function LeadActions({ id, status, can }: { id: string; status: string; can: { edit: boolean; archive: boolean } }) {
  const t = useTranslations("os.crm.a");
  const { pending, error, run } = useRun();
  const [lost, setLost] = useState(false);
  const active = status === "OPEN" || status === "QUALIFIED";
  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {can.edit && status === "OPEN" && (
          <button disabled={pending} onClick={() => run(() => qualifyLeadAction(id))} className="os-btn-success">
            <Icon name="BadgeCheck" size={14} /> {t("qualify")}
          </button>
        )}
        {can.edit && active && (
          <button disabled={pending} onClick={() => setLost(true)} className="os-btn-danger">
            <Icon name="CircleX" size={14} /> {t("markLost")}
          </button>
        )}
        {can.edit && status === "LOST" && (
          <button disabled={pending} onClick={() => run(() => reopenLeadAction(id))} className="os-btn-secondary">
            <Icon name="RotateCcw" size={14} /> {t("reopen")}
          </button>
        )}
        {can.archive && (active || status === "LOST") && (
          <button disabled={pending} onClick={() => run(() => archiveLeadAction(id))} className="os-btn-ghost">
            <Icon name="Archive" size={14} /> {t("archive")}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <LostReasonDialog open={lost} onClose={() => setLost(false)} pending={pending} error={error} onConfirm={(reason) => run(() => markLeadLostAction(id, reason), () => setLost(false))} />
    </div>
  );
}

export function OpportunityActions({ id, status, can }: { id: string; status: string; can: { win: boolean; lose: boolean; edit: boolean } }) {
  const t = useTranslations("os.crm");
  const { pending, error, run } = useRun();
  const [lost, setLost] = useState(false);
  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {can.win && status === "OPEN" && (
          <button disabled={pending} onClick={() => window.confirm(t("pipeline.confirmWon")) && run(() => markWonAction(id))} className="os-btn-success">
            <Icon name="Trophy" size={14} /> {t("a.markWon")}
          </button>
        )}
        {can.lose && status === "OPEN" && (
          <button disabled={pending} onClick={() => setLost(true)} className="os-btn-danger">
            <Icon name="CircleX" size={14} /> {t("a.markOpportunityLost")}
          </button>
        )}
        {can.edit && status !== "ARCHIVED" && status !== "OPEN" && (
          <button disabled={pending} onClick={() => run(() => archiveOpportunityAction(id))} className="os-btn-ghost">
            <Icon name="Archive" size={14} /> {t("a.archive")}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <LostReasonDialog open={lost} onClose={() => setLost(false)} pending={pending} error={error} onConfirm={(reason) => run(() => markOppLostAction(id, reason), () => setLost(false))} />
    </div>
  );
}

export function ArchiveClientButton({ id }: { id: string }) {
  const t = useTranslations("os.crm.a");
  const { pending, error, run } = useRun();
  return (
    <span className="grid justify-items-end gap-1">
      <button disabled={pending} onClick={() => run(() => archiveClientAction(id))} className="os-btn-ghost">
        <Icon name="Archive" size={14} /> {t("archive")}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

/** Saved list views: chips + "save current". */
export function SavedViews({ module, views, query }: { module: "leads" | "opportunities" | "clients"; views: { id: string; name: string; query: string }[]; query: string }) {
  const t = useTranslations("os.crm");
  const router = useRouter();
  const { pending, run } = useRun();
  const base = `/app/crm/${module}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-os-faint">{t("leads.savedViews")}:</span>
      {views.map((v) => (
        <span key={v.id} className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs ${v.query === query ? "border-iris bg-iris/10 text-iris-light" : "border-os-line text-os-muted"}`}>
          <button onClick={() => router.push(`${base}?${v.query}`)}>{v.name}</button>
          <button disabled={pending} aria-label="remove" onClick={() => run(() => deleteViewAction(v.id))} className="text-os-faint hover:text-danger">
            ×
          </button>
        </span>
      ))}
      {query && (
        <button
          disabled={pending}
          onClick={() => {
            const name = window.prompt(t("leads.viewName"));
            if (name?.trim()) run(() => saveViewAction(module, name.trim(), query));
          }}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-os-line-strong px-2.5 text-xs text-os-muted hover:text-os-text"
        >
          <Icon name="Bookmark" size={12} /> {t("a.saveView")}
        </button>
      )}
    </div>
  );
}
