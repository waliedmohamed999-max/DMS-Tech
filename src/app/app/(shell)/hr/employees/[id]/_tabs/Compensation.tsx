import { bankAccounts } from "@/server/hr/compensation";
import { addCompensationAction, revealIbanAction, setBankAction } from "@/lib/os/hr-actions";
import { Badge, EmptyState, fmtDate, SectionCard } from "@/components/os/ui";
import { ActionForm, RevealIban } from "@/components/hr/Forms";
import type { EmployeeTabCtx } from "./context";

export async function Compensation({ tc }: { tc: EmployeeTabCtx }) {
  const { ctx, id, d, c, locale, t, org, comp, m } = tc;
  return (
    <div className="grid gap-5">
      {c.compensation && (
        <SectionCard
          title={t("compensation")}
          action={
            c.compensationManage && !d.rel.self ? (
              <ActionForm
                action={addCompensationAction}
                args={[id]}
                trigger={`+ ${t("a.newCompensation")}`}
                triggerClass="os-btn-primary h-8 px-3 text-xs"
                submitLabel={t("save")}
                note={t("compensationNote")}
                fields={[
                  { name: "baseSalary", label: t("f.baseSalary"), type: "number", required: true },
                  { name: "housingAllowance", label: t("f.housing"), type: "number" },
                  { name: "transportAllowance", label: t("f.transport"), type: "number" },
                  { name: "otherFixedAllowance", label: t("f.otherAllowance"), type: "number" },
                  { name: "currency", label: t("f.currency"), value: org.currency, required: true },
                  { name: "effectiveFrom", label: t("f.effectiveFrom"), type: "date", required: true },
                  { name: "notes", label: t("f.notes"), type: "textarea" }
                ]}
              />
            ) : undefined
          }
        >
          {comp.length === 0 ? (
            <EmptyState icon="Briefcase" title={t("noCompensation")} text="" />
          ) : (
            <div className="overflow-x-auto">
              <table className="os-table">
                <thead>
                  <tr>
                    <th>{t("f.effectiveFrom")}</th>
                    <th className="text-end">{t("f.baseSalary")}</th>
                    <th className="text-end">{t("f.housing")}</th>
                    <th className="text-end">{t("f.transport")}</th>
                    <th className="text-end">{t("f.otherAllowance")}</th>
                    <th className="text-end">{t("monthlyTotal")}</th>
                  </tr>
                </thead>
                <tbody>
                  {comp.map((r) => (
                    <tr key={r.id} className={r.effectiveTo ? "text-os-muted" : ""}>
                      <td className="whitespace-nowrap text-xs">
                        {fmtDate(r.effectiveFrom, locale)} {locale === "ar" ? "←" : "→"} {r.effectiveTo ? fmtDate(r.effectiveTo, locale) : <Badge tone="success">{t("current")}</Badge>}
                      </td>
                      <td className="text-end text-xs tabular" dir="ltr">{m(r.baseSalary, r.currency)}</td>
                      <td className="text-end text-xs tabular" dir="ltr">{m(r.housingAllowance, r.currency)}</td>
                      <td className="text-end text-xs tabular" dir="ltr">{m(r.transportAllowance, r.currency)}</td>
                      <td className="text-end text-xs tabular" dir="ltr">{m(r.otherFixedAllowance, r.currency)}</td>
                      <td className="text-end text-sm font-semibold tabular" dir="ltr">{m(r.baseSalary.plus(r.housingAllowance).plus(r.transportAllowance).plus(r.otherFixedAllowance), r.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("compHistoryNote")}</p>
        </SectionCard>
      )}
      {c.bank && (
        <SectionCard
          title={t("bank")}
          action={
            c.bankManage && !d.rel.self ? (
              <ActionForm
                action={setBankAction}
                args={[id]}
                trigger={`+ ${t("a.newBank")}`}
                triggerClass="os-btn-secondary h-8 px-3 text-xs"
                submitLabel={t("save")}
                fields={[
                  { name: "bankName", label: t("f.bankName"), required: true },
                  { name: "accountName", label: t("f.accountName"), required: true },
                  { name: "iban", label: "IBAN", required: true, dir: "ltr" },
                  { name: "effectiveFrom", label: t("f.effectiveFrom"), type: "date", required: true }
                ]}
              />
            ) : undefined
          }
        >
          <ul className="divide-y divide-os-line text-sm">
            {(await bankAccounts(ctx, id)).map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="font-medium">{b.bankName}</span>
                <span className="text-xs text-os-muted">{b.accountName}</span>
                {c.bankManage && !d.rel.self ? <RevealIban action={revealIbanAction} id={b.id} masked={b.iban} label={t("a.reveal")} /> : <span className="font-mono text-xs" dir="ltr">{b.iban}</span>}
                <span className="flex-1" />
                <span className="text-xs text-os-faint">{fmtDate(b.effectiveFrom, locale)}{b.effectiveTo ? ` ${locale === "ar" ? "←" : "→"} ${fmtDate(b.effectiveTo, locale)}` : ""}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("bankNote")}</p>
        </SectionCard>
      )}
    </div>
  );
}
