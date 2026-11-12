import { fmtDate, SectionCard } from "@/components/os/ui";
import type { EmployeeTabCtx } from "./context";

export async function Employment({ tc }: { tc: EmployeeTabCtx }) {
  const { e, locale, t, it, ageOf, row } = tc;
  return (
    <SectionCard title={t("tabs.employment")}>
      <dl className="grid p-4 text-sm sm:grid-cols-2 sm:gap-x-8">
        {row(t("f.employmentType"), t(`type.${e.employmentType}` as "type.FULL_TIME"))}
        {row(t("f.joinDate"), fmtDate(e.joinDate, locale))}
        {row(t("f.probationEnd"), e.probationEndDate ? fmtDate(e.probationEndDate, locale) : null)}
        {row(t("f.terminationDate"), e.terminationDate ? fmtDate(e.terminationDate, locale) : null)}
        {e.terminationReason && row(t("f.reason"), e.terminationReason)}
        {row(t("f.workLocation"), e.workLocation)}
        {row(t("f.city"), [e.city, e.country].filter(Boolean).join(", "))}
        {row(t("f.nationality"), e.nationality)}
        {row(it.gender, e.gender ? it[e.gender] : null)}
        {row(it.birthDate, e.birthDate ? `${fmtDate(e.birthDate, locale)} · ${it.age(ageOf(e.birthDate))}` : null)}
        {row(it.nationalId, e.nationalId && <span dir="ltr">{e.nationalId}</span>)}
      </dl>
    </SectionCard>
  );
}
