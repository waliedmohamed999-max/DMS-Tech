import { employeeExpiries, FINAL_WARNING_DAYS } from "@/server/hr/expiries";
import { expiryTone } from "@/lib/os/hr-page";
import { setExpiryAction } from "@/lib/os/hr-actions";
import { Badge, fmtDate, SectionCard } from "@/components/os/ui";
import { ActionForm } from "@/components/hr/Forms";
import type { EmployeeTabCtx } from "./context";

export async function Expiries({ tc }: { tc: EmployeeTabCtx }) {
  const { ctx, id, d, c, locale, t } = tc;
  return (
    <SectionCard title={t("exp.employeeTitle")}>
      <ul className="divide-y divide-os-line text-sm">
        {(await employeeExpiries(ctx, id)).map(({ kind, record: r }) => (
          <li key={kind} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{t(`exp.kind.${kind}` as "exp.kind.IQAMA")}</span>
              {r?.number && (
                <span className="mx-2 text-xs text-os-faint" dir="ltr">
                  {r.number}
                </span>
              )}
              <span className="block text-xs text-os-muted">
                {r ? `${fmtDate(r.expiryDate, locale)} · ${r.days < 0 ? t("exp.overdue", { n: -r.days }) : r.days === 0 ? t("exp.today") : t("exp.daysLeft", { n: r.days })}` : t("exp.notSet")}
              </span>
            </span>
            {r && (
              <Badge tone={expiryTone(r.stage)} dot>
                {t(`exp.stage.${r.stage}` as "exp.stage.ok")}
              </Badge>
            )}
            {c.edit && d.rel.hr && (
              <ActionForm
                action={setExpiryAction}
                args={[id, kind]}
                trigger={r ? t("a.edit") : `+ ${t("exp.add")}`}
                triggerClass="os-btn-ghost h-8 px-3 text-xs"
                title={t(`exp.kind.${kind}` as "exp.kind.IQAMA")}
                submitLabel={t("save")}
                note={t("exp.editNote", { final: FINAL_WARNING_DAYS })}
                fields={[
                  { name: "expiryDate", label: t("exp.col.expiry"), type: "date", value: r ? r.expiryDate.toISOString().slice(0, 10) : "" },
                  // a masked number is left out, so saving keeps it
                  ...(kind === "CONTRACT" || r?.number === "••••" ? [] : [{ name: "number", label: t("exp.col.number"), value: r?.number ?? "", dir: "ltr" as const }])
                ]}
              />
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
