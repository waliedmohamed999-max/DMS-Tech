import Link from "next/link";
import { nameOf } from "@/lib/os/hr-page";
import { SectionCard } from "@/components/os/ui";
import type { EmployeeTabCtx } from "./context";

export async function Overview({ tc }: { tc: EmployeeTabCtx }) {
  const { d, e, locale, t, row } = tc;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard title={t("contact")}>
        <dl className="p-4 text-sm">
          {row(t("f.workEmail"), e.workEmail && <span dir="ltr">{e.workEmail}</span>)}
          {row(t("f.workPhone"), e.workPhone && <span dir="ltr">{e.workPhone}</span>)}
          {row(t("f.personalEmail"), e.personalEmail && <span dir="ltr">{e.personalEmail}</span>)}
          {row(t("f.personalPhone"), e.personalPhone && <span dir="ltr">{e.personalPhone}</span>)}
          {row(t("f.emergency"), e.emergencyContactName ? `${e.emergencyContactName} · ${e.emergencyContactPhone ?? ""}` : null)}
        </dl>
        {!d.personalVisible && <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("maskedNote")}</p>}
      </SectionCard>
      <SectionCard title={t("team")}>
        <dl className="p-4 text-sm">
          {row(t("f.manager"), e.manager ? nameOf(e.manager, locale) : null)}
          {row(t("f.account"), e.user ? <span dir="ltr">{e.user.email}</span> : t("noAccount"))}
        </dl>
        <p className="border-t border-os-line px-4 py-2 text-xs font-semibold">{t("directReports", { n: e.reports.length })}</p>
        <ul className="divide-y divide-os-line text-sm">
          {e.reports.map((r) => (
            <li key={r.id} className="px-4 py-2">
              <Link href={`/app/hr/employees/${r.id}`} className="hover:text-iris-light">
                {nameOf(r, locale)}
              </Link>
              <span className="ms-2 text-xs text-os-faint">{r.jobTitle}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
