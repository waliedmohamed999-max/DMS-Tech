import { projectActivity } from "@/server/projects/insights";
import { EmptyState, fmtDateTime, SectionCard } from "@/components/os/ui";
import type { ProjectTabCtx } from "./context";

export async function Activity({ c }: { c: ProjectTabCtx }) {
  const { ctx, id, locale, t, name } = c;
  const rows = await projectActivity(ctx, id);
  return (
    <SectionCard title={t("tabs.activity")}>
      {rows.length === 0 ? (
        <EmptyState icon="ChartLine" title={t("noActivity")} text="" />
      ) : (
        <ul className="divide-y divide-os-line text-sm">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-2 px-4 py-2">
              <span className="font-medium">{t.has(`ev.${a.type.replace(/\./g, "_")}`) ? t(`ev.${a.type.replace(/\./g, "_")}` as "ev.task_created") : a.type}</span>
              {typeof a.detail.title === "string" && <span className="text-os-muted">· {a.detail.title}</span>}
              {typeof a.detail.reason === "string" && a.detail.reason && <span className="text-xs text-os-faint">· {a.detail.reason}</span>}
              <span className="ms-auto text-xs text-os-faint">
                {a.actor ? name(a.actor) : t("system")} · {fmtDateTime(a.at, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
