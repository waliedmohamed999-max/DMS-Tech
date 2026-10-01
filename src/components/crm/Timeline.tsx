"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/os/action";
import { addNoteAction, deleteNoteAction, logActivityAction, updateNoteAction } from "@/lib/os/crm-actions";
import { ACTIVITY_TYPES_USER } from "@/lib/crm/services";
import { useErrorText } from "@/components/os/client";
import { Icon, type IconName } from "@/components/ui/Icon";

export type TimelineActivity = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  isSystem: boolean;
  occurredAt: string;
  metadata: Record<string, unknown> | null;
  author: string | null;
};
export type TimelineNote = { id: string; body: string; createdAt: string; updatedAt: string; author: string | null; mine: boolean };

const TYPE_ICON: Record<string, IconName> = {
  CALL: "PhoneCall", EMAIL: "Mail", WHATSAPP: "MessagesSquare", MEETING: "Users", NOTE: "FileText", TASK: "CircleCheck", FOLLOW_UP: "CalendarClock", STATUS_CHANGE: "Route", SYSTEM: "Settings"
};

const fmt = (d: string, locale: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

export function ActivityTimeline({ items, entityType, entityId, canCreate }: { items: TimelineActivity[]; entityType: "LEAD" | "CLIENT" | "OPPORTUNITY"; entityId: string; canCreate: boolean }) {
  const t = useTranslations("os.crm");
  const locale = useLocale();
  const router = useRouter();
  const err = useErrorText();
  const [state, action, pending] = useActionState(async (p: ActionResult<void> | null, fd: FormData) => {
    const r = await logActivityAction(p, fd);
    if (r.ok) router.refresh();
    return r;
  }, null);
  const sysTitle = (k: string) => {
    const key = `systemTitles.${k.replace(/\./g, "_")}`;
    return t.has(key) ? t(key as "systemTitles.lead_created") : k;
  };
  const metaLine = (a: TimelineActivity) => {
    const m = a.metadata ?? {};
    // Phase 3 commercial trail (quotations / contracts recorded on the opportunity or client)
    if (typeof m.contractNumber === "string") return [m.contractNumber, typeof m.quotationNumber === "string" ? `← ${m.quotationNumber}${m.version ? ` V${m.version}` : ""}` : null, m.milestone, m.status, m.reason].filter((x) => typeof x === "string" && x).join(" · ");
    if (typeof m.quotationNumber === "string")
      return [`${m.quotationNumber}${m.version ? ` V${m.version}` : ""}`, typeof m.total === "string" ? `${m.total} ${typeof m.currency === "string" ? m.currency : ""}`.trim() : null, typeof m.reason === "string" ? m.reason : null].filter(Boolean).join(" · ");
    if (typeof m.fromStage === "string" && typeof m.toStage === "string") return `${m.fromStage} → ${m.toStage}${m.lostReason ? ` · ${m.lostReason}` : ""}`;
    if (typeof m.from === "string" && typeof m.to === "string") return `${t.has(`leadStatus.${m.from}`) ? t(`leadStatus.${m.from}` as "leadStatus.OPEN") : m.from} → ${t.has(`leadStatus.${m.to}`) ? t(`leadStatus.${m.to}` as "leadStatus.OPEN") : m.to}`;
    if (typeof m.reason === "string" && m.reason) return m.reason;
    if (typeof m.opportunityNumber === "string") return m.opportunityNumber;
    if (typeof m.form === "string") return [m.name, m.email, m.phone].filter(Boolean).join(" · ");
    return null;
  };
  return (
    <div className="grid gap-4">
      {canCreate && (
        <form action={action} className="grid gap-2 rounded-lg border border-os-line bg-os-panel p-3">
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="entityId" value={entityId} />
          <div className="grid gap-2 sm:grid-cols-[150px_1fr_190px]">
            <select name="type" defaultValue="CALL" className="os-input">
              {ACTIVITY_TYPES_USER.map((x) => (
                <option key={x} value={x}>
                  {t(`activityType.${x}`)}
                </option>
              ))}
            </select>
            <input name="title" required minLength={2} placeholder={t("activity.titlePh")} className="os-input" />
            <input name="occurredAt" type="datetime-local" aria-label={t("activity.when")} className="os-input" />
          </div>
          <textarea name="description" rows={2} placeholder={t("activity.descPh")} className="os-input" />
          <div className="flex items-center justify-end gap-3">
            {state && !state.ok && <span className="text-xs text-danger">{err(state.error)}</span>}
            <button disabled={pending} className="os-btn-primary h-8 text-xs">
              {t("a.logActivity")}
            </button>
          </div>
        </form>
      )}
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-os-muted">{t("activity.empty")}</p>
      ) : (
        <ol className="relative grid gap-0">
          {items.map((a) => (
            <li key={a.id} className="relative flex gap-3 pb-4 ps-1">
              <span className={`relative z-10 mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border ${a.isSystem ? "border-os-line bg-os-panel text-os-faint" : "border-iris/40 bg-iris/15 text-iris-light"}`}>
                <Icon name={TYPE_ICON[a.type] ?? "Settings"} size={13} />
              </span>
              <div className="min-w-0 flex-1 border-b border-os-line pb-3">
                <p className="flex flex-wrap items-center gap-x-2 text-sm">
                  <span className="font-medium text-os-text">{a.isSystem ? sysTitle(a.title) : a.title}</span>
                  <span className="text-xs text-os-faint">· {t(`activityType.${a.type}` as "activityType.CALL")}</span>
                  {a.isSystem && <span className="rounded border border-os-line px-1 text-[10px] text-os-faint">{t("activity.system")}</span>}
                </p>
                {a.isSystem && metaLine(a) && <p className="mt-0.5 text-xs text-os-muted" dir="auto">{metaLine(a)}</p>}
                {a.description && <p className="mt-1 whitespace-pre-wrap text-sm text-os-muted" dir="auto">{a.description}</p>}
                <p className="mt-1 text-[11px] text-os-faint">
                  {a.author ?? t("activity.system")} · {fmt(a.occurredAt, locale)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function NotesPanel({ items, entityType, entityId, canCreate }: { items: TimelineNote[]; entityType: "LEAD" | "CLIENT" | "OPPORTUNITY"; entityId: string; canCreate: boolean }) {
  const t = useTranslations("os.crm");
  const tc = useTranslations("os.common");
  const locale = useLocale();
  const router = useRouter();
  const err = useErrorText();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const [state, action, adding] = useActionState(async (p: ActionResult<void> | null, fd: FormData) => {
    const r = await addNoteAction(p, fd);
    if (r.ok) router.refresh();
    return r;
  }, null);
  return (
    <div className="grid gap-4">
      {canCreate && (
        <form action={action} className="grid gap-2">
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="entityId" value={entityId} />
          <textarea name="body" required rows={3} placeholder={t("notes.placeholder")} className="os-input" />
          <div className="flex items-center justify-end gap-3">
            {state && !state.ok && <span className="text-xs text-danger">{err(state.error)}</span>}
            <button disabled={adding} className="os-btn-primary h-8 text-xs">
              {t("a.addNote")}
            </button>
          </div>
        </form>
      )}
      {items.length === 0 && <p className="py-6 text-center text-sm text-os-muted">{t("notes.empty")}</p>}
      <ul className="grid gap-3">
        {items.map((n) => (
          <li key={n.id} className="rounded-lg border border-os-line bg-os-panel p-3">
            {editing === n.id ? (
              <div className="grid gap-2">
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="os-input" />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditing(null)} className="os-btn-ghost h-8 text-xs">
                    {tc("cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={pending || !draft.trim()}
                    onClick={() =>
                      start(async () => {
                        const r = await updateNoteAction(n.id, draft);
                        if (r.ok) {
                          setEditing(null);
                          router.refresh();
                        }
                      })
                    }
                    className="os-btn-primary h-8 text-xs"
                  >
                    {tc("save")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="whitespace-pre-wrap text-sm text-os-text" dir="auto">
                  {n.body}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-os-faint">
                  <span>
                    {n.author ?? "—"} · {fmt(n.createdAt, locale)}
                    {n.updatedAt !== n.createdAt && ` · ${t("notes.edited")}`}
                  </span>
                  {n.mine && (
                    <span className="flex gap-1">
                      <button type="button" onClick={() => (setEditing(n.id), setDraft(n.body))} className="os-btn-ghost h-7 px-2 text-[11px]">
                        <Icon name="Pencil" size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => start(async () => void ((await deleteNoteAction(n.id)).ok && router.refresh()))}
                        className="os-btn-ghost h-7 px-2 text-[11px] text-danger"
                      >
                        <Icon name="X" size={12} />
                      </button>
                    </span>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
