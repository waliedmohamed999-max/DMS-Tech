"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { taskStatusAction } from "@/lib/os/project-actions";
import { Icon } from "@/components/ui/Icon";
import { ReasonModal, useRun } from "./shared";

export type BoardCard = { id: string; number: string; title: string; status: string; priority: string; dueDate: string | null; assignee: string | null; milestone: string | null; subtasks: number; blockedReason: string | null; mine: boolean };
export type BoardColumn = { status: string; total: number; items: BoardCard[] };

/** Allowed moves mirror the server rules (the server re-validates every drop). */
const MOVES: Record<string, string[]> = {
  BACKLOG: ["TODO", "IN_PROGRESS"],
  TODO: ["BACKLOG", "IN_PROGRESS", "BLOCKED"],
  IN_PROGRESS: ["TODO", "REVIEW", "BLOCKED", "DONE"],
  REVIEW: ["IN_PROGRESS", "DONE", "BLOCKED"],
  BLOCKED: ["TODO", "IN_PROGRESS"],
  DONE: ["IN_PROGRESS"]
};
const DOT: Record<string, string> = { BACKLOG: "bg-os-faint", TODO: "bg-info", IN_PROGRESS: "bg-iris", REVIEW: "bg-warning", BLOCKED: "bg-danger", DONE: "bg-success" };
const PRI: Record<string, string> = { URGENT: "text-danger", HIGH: "text-warning", MEDIUM: "text-os-muted", LOW: "text-os-faint" };

export default function TaskBoard({ projectId, columns, canMoveAll, today, query }: { projectId: string; columns: BoardColumn[]; canMoveAll: boolean; today: string; query: string }) {
  const t = useTranslations("os.projects");
  const locale = useLocale();
  const { pending, error, run } = useRun();
  const [drag, setDrag] = useState<BoardCard | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [blockFor, setBlockFor] = useState<{ card: BoardCard; position: number } | null>(null);
  const can = (c: BoardCard) => canMoveAll || c.mine;
  const move = (card: BoardCard, to: string, position: number) => {
    if (to === card.status && position === undefined) return;
    if (to !== card.status && !MOVES[card.status]?.includes(to)) return;
    if (to === "BLOCKED") return setBlockFor({ card, position });
    run(() => taskStatusAction(card.id, to, { from: card.status, position }));
  };
  const short = (d: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d));

  return (
    <div className="grid gap-2">
      {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="no-scrollbar -mx-3 flex snap-x items-start gap-3 overflow-x-auto px-3 pb-3 sm:mx-0 sm:px-0">
        {columns.map((col) => (
          <section
            key={col.status}
            aria-label={t(`taskStatus.${col.status}` as "taskStatus.TODO")}
            onDragOver={(e) => {
              if (!drag || (drag.status !== col.status && !MOVES[drag.status]?.includes(col.status))) return;
              e.preventDefault();
              setOver(col.status);
            }}
            onDragLeave={() => setOver((o) => (o === col.status ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              if (drag) {
                const cards = [...e.currentTarget.querySelectorAll("[data-card]")];
                const idx = cards.findIndex((el) => el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 > e.clientY);
                move(drag, col.status, idx === -1 ? cards.length : idx);
              }
              setDrag(null);
            }}
            className={`flex w-[250px] shrink-0 snap-start flex-col rounded-xl border bg-os-panel ${over === col.status ? "border-iris bg-iris/5" : "border-os-line"}`}
          >
            <header className="flex items-center gap-2 border-b border-os-line px-3 py-2">
              <span className={`size-2 rounded-full ${DOT[col.status]}`} />
              <h3 className="flex-1 text-[12.5px] font-semibold">{t(`taskStatus.${col.status}` as "taskStatus.TODO")}</h3>
              <span className="rounded bg-os-raised px-1.5 text-[11px] text-os-muted tabular">{col.total}</span>
            </header>
            <ul className="grid max-h-[calc(100dvh-300px)] min-h-20 content-start gap-1.5 overflow-y-auto p-1.5">
              {col.items.map((c) => (
                <li
                  key={c.id}
                  data-card
                  draggable={can(c) && !pending}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", c.id);
                    setDrag(c);
                  }}
                  onDragEnd={() => setDrag(null)}
                  className={`rounded-lg border border-os-line bg-os-surface p-2.5 text-[12.5px] ${can(c) ? "cursor-grab" : ""} ${drag?.id === c.id ? "opacity-40" : ""}`}
                >
                  <Link href={`?${query}${query ? "&" : ""}task=${c.id}`} scroll={false} className="block">
                    <span className="flex items-center justify-between gap-2 text-[10.5px] text-os-faint">
                      <span dir="ltr">{c.number}</span>
                      <span className={`font-medium ${PRI[c.priority]}`}>{t(`priority.${c.priority}` as "priority.MEDIUM")}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 font-medium text-os-text">{c.title}</span>
                    {c.blockedReason && <span className="mt-1 line-clamp-2 block text-[11px] text-danger">⛔ {c.blockedReason}</span>}
                  </Link>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-os-faint">
                    {c.assignee && <span className="truncate">{c.assignee}</span>}
                    {c.dueDate && (
                      <span className={`inline-flex items-center gap-0.5 ${c.dueDate < today && c.status !== "DONE" ? "text-danger" : ""}`}>
                        <Icon name="CalendarClock" size={10} /> {short(c.dueDate)}
                      </span>
                    )}
                    {c.subtasks > 0 && <span>↳ {c.subtasks}</span>}
                    {c.milestone && <span className="truncate">◆ {c.milestone}</span>}
                  </div>
                  {can(c) && (
                    <select
                      aria-label={t("moveTo")}
                      value=""
                      disabled={pending}
                      onChange={(e) => e.target.value && move(c, e.target.value, 0)}
                      className="mt-1.5 w-full rounded-md border border-os-line bg-os-panel px-1.5 py-1 text-[11px] text-os-muted lg:hidden"
                    >
                      <option value="">{t("moveTo")}…</option>
                      {(MOVES[c.status] ?? []).map((s) => (
                        <option key={s} value={s}>
                          {t(`taskStatus.${s}` as "taskStatus.TODO")}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              ))}
              {col.total > col.items.length && <li className="px-2 py-1 text-center text-[11px] text-os-faint">+{col.total - col.items.length}</li>}
              {col.total === 0 && <li className="rounded-lg border border-dashed border-os-line py-4 text-center text-[11px] text-os-faint">—</li>}
            </ul>
          </section>
        ))}
      </div>
      <ReasonModal
        open={Boolean(blockFor)}
        title={t("blockTitle")}
        hint={t("blockHint")}
        confirmLabel={t("block")}
        danger
        pending={pending}
        error={error}
        onClose={() => setBlockFor(null)}
        onConfirm={(reason) => blockFor && run(() => taskStatusAction(blockFor.card.id, "BLOCKED", { from: blockFor.card.status, reason, position: blockFor.position }), () => setBlockFor(null))}
      />
      <span className="sr-only">{projectId}</span>
    </div>
  );
}
