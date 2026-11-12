import { employeeActivity } from "@/server/hr/employees";
import { personName } from "@/lib/os/crm-page";
import { fmtDateTime, SectionCard } from "@/components/os/ui";
import type { EmployeeTabCtx } from "./context";

export async function Activity({ tc }: { tc: EmployeeTabCtx }) {
  const { ctx, id, locale, t } = tc;
  return (
    <SectionCard title={t("tabs.activity")}>
      <ul className="divide-y divide-os-line text-sm">
        {(await employeeActivity(ctx, id)).map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
            <span className="font-medium">{t.has(`audit.${a.action.replace(/\./g, "_")}`) ? t(`audit.${a.action.replace(/\./g, "_")}` as "audit.employee_created") : a.action}</span>
            <span className="text-xs text-os-muted">{personName(a.actor, locale) ?? t("system")}</span>
            <span className="flex-1" />
            <span className="text-xs text-os-faint">{fmtDateTime(a.createdAt, locale)}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
