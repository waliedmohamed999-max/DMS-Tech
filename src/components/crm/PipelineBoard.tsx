"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { moveStageAction } from "@/lib/os/crm-actions";
import { useErrorText } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";
import { LostReasonDialog } from "./CrmForms";

export type BoardCard = {
  id: string;
  number: string;
  title: string;
  estimatedValue: string;
  currency: string;
  status: string;
  expectedCloseDate: string | null;
  nextFollowUpAt: string | null;
  client: string;
  owner: string | null;
};
export type BoardStage = { id: string; key: string; name: string; colorToken: string; isWonStage: boolean; isLostStage: boolean; count: number; total: string; items: BoardCard[] };

const TONE: Record<string, string> = {
  neutral: "bg-os-faint", info: "bg-info", iris: "bg-iris", warning: "bg-warning", success: "bg-success", danger: "bg-danger"
};

const money = (v: string, currency: string, locale: string) =>
  new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(v));
const shortDate = (d: string, locale: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { day: "numeric", month: "short" }).format(new Date(d));

/**
 * Kanban over DB pipeline stages. A drop never mutates state locally first: it calls the
 * server mutation (permission + validation + audit + event) and then re-fetches. Lost
 * requires a reason dialog; Won asks for confirmation. Mobile uses the per-card "Move to" menu.
 */
export default function PipelineBoard({ stages, canMove, canWin, canLose }: { stages: BoardStage[]; canMove: boolean; canWin: boolean; canLose: boolean }) {
  const t = useTranslations("os.crm");
  const locale = useLocale();
  const router = useRouter();
  const err = useErrorText();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [lost, setLost] = useState<{ oppId: string; stageId: string } | null>(null);
  const [error, setError] = useState<string>();
  const [, start] = useTransition();

  const stageOf = (id: string) => stages.find((s) => s.id === id)!;

  const move = (oppId: string, stageId: string, lostReason?: string) => {
    setPendingId(oppId);
    setError(undefined);
    start(async () => {
      const r = await moveStageAction(oppId, stageId, lostReason);
      if (!r.ok) setError(err(r.error));
      setLost(null);
      router.refresh();
      setPendingId(null);
    });
  };

  const request = (oppId: string, stageId: string) => {
    const s = stageOf(stageId);
    const current = stages.find((x) => x.items.some((i) => i.id === oppId));
    if (!s || current?.id === stageId) return;
    if (s.isLostStage) {
      if (!canLose) return setError(err("FORBIDDEN"));
      return setLost({ oppId, stageId });
    }
    if (s.isWonStage) {
      if (!canWin) return setError(err("FORBIDDEN"));
      if (!window.confirm(t("pipeline.confirmWon"))) return;
    }
    move(oppId, stageId);
  };

  return (
    <div>
      {error && <p className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="no-scrollbar -mx-3 flex snap-x items-start gap-3 overflow-x-auto px-3 pb-4 sm:-mx-6 sm:px-6">
        {stages.map((s) => (
          <section
            key={s.id}
            onDragOver={(e) => {
              if (!canMove || !dragging) return;
              e.preventDefault();
              setOver(s.id);
            }}
            onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id) request(id, s.id);
              setDragging(null);
            }}
            className={`flex w-[272px] shrink-0 snap-start flex-col rounded-xl border bg-os-panel transition ${over === s.id ? "border-iris bg-iris/5" : "border-os-line"}`}
            aria-label={s.name}
          >
            <header className="flex items-center gap-2 border-b border-os-line px-3 py-2.5">
              <span className={`size-2 rounded-full ${TONE[s.colorToken] ?? TONE.neutral}`} />
              <h3 className="flex-1 truncate text-[13px] font-semibold">{s.name}</h3>
              <span className="rounded bg-os-raised px-1.5 text-[11px] text-os-muted tabular">{s.count}</span>
            </header>
            <p className="px-3 pt-2 text-[11px] text-os-faint tabular" dir="ltr">
              {money(s.total, "SAR", locale)}
            </p>
            <ul className="grid max-h-[calc(100dvh-280px)] min-h-24 content-start gap-2 overflow-y-auto p-2">
              {s.items.length === 0 && <li className="rounded-lg border border-dashed border-os-line py-6 text-center text-xs text-os-faint">{t("pipeline.emptyStage")}</li>}
              {s.items.map((c) => (
                <li
                  key={c.id}
                  draggable={canMove && pendingId !== c.id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", c.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragging(c.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  className={`group rounded-lg border border-os-line bg-os-surface p-3 transition hover:border-os-line-strong ${canMove ? "cursor-grab active:cursor-grabbing" : ""} ${pendingId === c.id ? "opacity-50" : ""} ${dragging === c.id ? "opacity-40" : ""}`}
                >
                  <Link href={`/app/crm/opportunities/${c.id}`} className="block">
                    <p className="text-[11px] text-os-faint" dir="ltr">
                      {c.number}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[13px] font-medium text-os-text">{c.title}</p>
                    <p className="mt-0.5 truncate text-xs text-os-muted">{c.client}</p>
                  </Link>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold tabular" dir="ltr">
                      {money(c.estimatedValue, c.currency, locale)}
                    </span>
                    {c.owner && <span className="truncate text-[11px] text-os-faint">{c.owner}</span>}
                  </div>
                  {(c.nextFollowUpAt || c.expectedCloseDate) && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-os-faint">
                      {c.nextFollowUpAt && (
                        <span className={`inline-flex items-center gap-1 ${new Date(c.nextFollowUpAt) < new Date() ? "text-danger" : ""}`}>
                          <Icon name="CalendarClock" size={11} /> {shortDate(c.nextFollowUpAt, locale)}
                        </span>
                      )}
                      {c.expectedCloseDate && (
                        <span className="inline-flex items-center gap-1">
                          <Icon name="Target" size={11} /> {shortDate(c.expectedCloseDate, locale)}
                        </span>
                      )}
                    </div>
                  )}
                  {canMove && (
                    <select
                      aria-label={t("a.moveTo")}
                      value=""
                      onChange={(e) => e.target.value && request(c.id, e.target.value)}
                      className="mt-2 w-full rounded-md border border-os-line bg-os-panel px-2 py-1 text-xs text-os-muted lg:hidden"
                    >
                      <option value="">{t("a.moveTo")}…</option>
                      {stages
                        .filter((x) => x.id !== s.id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <LostReasonDialog key={lost?.oppId ?? "none"} open={Boolean(lost)} onClose={() => setLost(null)} pending={Boolean(pendingId)} onConfirm={(reason) => lost && move(lost.oppId, lost.stageId, reason)} />
    </div>
  );
}
