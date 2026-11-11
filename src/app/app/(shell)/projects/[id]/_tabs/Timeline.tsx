import { fmtDate, SectionCard } from "@/components/os/ui";
import type { ProjectTabCtx } from "./context";

export async function Timeline({ c }: { c: ProjectTabCtx }) {
  const { p, today, locale, t } = c;
  const items = p.milestones.filter((m) => m.status !== "CANCELLED");
  const start = p.startDate ?? items.map((m) => m.startDate ?? m.dueDate).sort((a, b) => a.getTime() - b.getTime())[0] ?? today;
  const end = [p.targetEndDate, ...items.map((m) => m.dueDate), today].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0]!;
  const span = Math.max(1, end.getTime() - start.getTime());
  const pos = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - start.getTime()) / span) * 100));
  return (
    <SectionCard title={t("tabs.timeline")}>
      <div className="grid gap-2 p-4">
        <div className="flex justify-between text-[11px] text-os-faint">
          <span>{fmtDate(start, locale)}</span>
          <span>{fmtDate(end, locale)}</span>
        </div>
        <div className="relative grid gap-2">
          <div className="pointer-events-none absolute inset-y-0 w-px bg-danger/60" style={{ insetInlineStart: `${pos(today)}%` }} title={t("today")} />
          {items.length === 0 && <p className="text-sm text-os-muted">{t("noMilestones")}</p>}
          {items.map((m, i) => {
            const s = m.startDate ?? (i === 0 ? start : items[i - 1].dueDate);
            const a = pos(s);
            const b = Math.max(a + 1.5, pos(m.dueDate));
            const tone = m.status === "COMPLETED" ? "bg-success/70" : m.dueDate < today ? "bg-danger/70" : m.status === "BLOCKED" ? "bg-warning/70" : "bg-iris/70";
            return (
              <div key={m.id} className="grid gap-0.5">
                <span className="text-xs">
                  {m.title} <span className="text-os-faint">· {fmtDate(m.dueDate, locale)}</span>
                </span>
                <div className="relative h-3 rounded bg-os-raised">
                  <div className={`absolute inset-y-0 rounded ${tone}`} style={{ insetInlineStart: `${a}%`, width: `${b - a}%` }} />
                </div>
              </div>
            );
          })}
          {p.targetEndDate && (
            <p className="text-[11px] text-os-faint">
              {t("target")}: {fmtDate(p.targetEndDate, locale)}
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
