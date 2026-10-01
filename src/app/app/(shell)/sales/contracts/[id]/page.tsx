import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { getContract } from "@/server/commercial/contracts";
import { prisma } from "@/server/db";
import { contractMilestoneEligibility } from "@/server/projects/insights";
import { ymd } from "@/server/commercial/dates";
import { personName } from "@/lib/os/crm-page";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, fmtDate, fmtDateTime, PermissionDenied, SectionCard } from "@/components/os/ui";
import { ContractActions, ContractEditor, MilestoneStatus } from "@/components/sales/ContractPanels";
import { contractStatusTone } from "@/components/sales/tones";
import { Icon } from "@/components/ui/Icon";

export const metadata = { title: "Contract" };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, allowed } = await pageCtx("sales.contracts.view");
  if (!allowed) return <PermissionDenied permission="sales.contracts.view" />;
  const locale = await getLocale();
  const t = await getTranslations("os.sales");
  let c;
  try {
    c = await getContract(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const money = (x: { toFixed(n: number): string }) => formatMoney(x.toFixed(2), locale, c.currency);
  const editable = ["DRAFT", "INTERNAL_REVIEW"].includes(c.status) && can(ctx, "sales.contracts.edit");
  const closed = ["EXPIRED", "TERMINATED", "CANCELLED"].includes(c.status);
  // Phase 4 delivery link: read-only view of the live project and milestone completion eligibility. Never mutates the contract.
  const tp = await getTranslations("os.projects");
  const [project, eligibility] = await Promise.all([
    prisma.project.findFirst({ where: { contractId: c.id, status: { not: "CANCELLED" } }, select: { id: true, number: true, status: true, progress: true } }),
    contractMilestoneEligibility(c.id)
  ]);
  const canCreateProject = !project && ["ACTIVE", "EXPIRING"].includes(c.status) && can(ctx, "projects.create");

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/sales/contracts" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">
            {c.number}
          </p>
          <h1 className="text-xl font-semibold">{c.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-os-muted">
            <Badge tone={contractStatusTone(c.status)} dot>
              {t(`cStatus.${c.status}` as "cStatus.DRAFT")}
            </Badge>
            <Link href={`/app/crm/clients/${c.client.id}?tab=contracts`} className="hover:text-iris-light">
              {c.client.displayName}
            </Link>
            {c.quotation && (
              <Link href={`/app/sales/quotations/${c.quotation.id}?v=${c.quotationVersion?.versionNumber}`} className="hover:text-iris-light" dir="ltr">
                {c.quotation.number} V{c.quotationVersion?.versionNumber}
              </Link>
            )}
            {c.opportunity && (
              <Link href={`/app/crm/opportunities/${c.opportunity.id}`} className="hover:text-iris-light">
                {c.opportunity.number}
              </Link>
            )}
            <span>
              {t("q.f.owner")}: {personName(c.owner, locale) ?? "—"}
            </span>
          </p>
        </div>
        <div className="text-end">
          <p className="text-xs text-os-faint">{t("c.value")}</p>
          <p className="text-2xl font-semibold tabular" dir="ltr">
            {money(c.contractValue)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {project && can(ctx, "projects.view") && (
            <Link href={`/app/projects/${project.id}`} className="os-btn-secondary">
              <Icon name="Layers" size={14} /> <span dir="ltr">{project.number}</span> · {tp(`status.${project.status}` as "status.ACTIVE")} · {project.progress}%
            </Link>
          )}
          {canCreateProject && (
            <Link href={`/app/projects/new?contract=${c.id}`} className="os-btn-primary">
              <Icon name="Layers" size={14} /> {tp("createProject")}
            </Link>
          )}
          <a href={`/app/sales/contracts/${c.id}/pdf`} target="_blank" rel="noopener" className="os-btn-secondary">
            <Icon name="FileText" size={14} /> {t("c.pdf")}
          </a>
          <a href={`/app/sales/contracts/${c.id}/pdf?download=1`} className="os-btn-ghost">
            {t("qa.download")}
          </a>
        </div>
        <ContractActions id={c.id} status={c.status} can={{ edit: can(ctx, "sales.contracts.edit"), activate: can(ctx, "sales.contracts.activate"), terminate: can(ctx, "sales.contracts.terminate") }} />
      </div>
      <p className="rounded-lg border border-os-line bg-os-panel px-4 py-2.5 text-xs text-os-muted">{t("c.legalNote")}</p>
      {c.terminationReason && <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{t("c.terminatedReason")}: {c.terminationReason}</p>}
      {c.cancelReason && <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{t("c.cancelledReason")}: {c.cancelReason}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
        <div className="grid gap-5">
          {editable ? (
            <SectionCard title={t("c.edit")}>
              <div className="p-4">
                <ContractEditor
                  id={c.id}
                  currency={c.currency}
                  initial={{
                    title: c.title,
                    startDate: ymd(c.startDate) ?? "",
                    endDate: ymd(c.endDate) ?? "",
                    renewalDate: ymd(c.renewalDate) ?? "",
                    paymentTerms: c.paymentTerms ?? "",
                    scopeOfWork: c.scopeOfWork ?? "",
                    terms: c.terms ?? "",
                    milestones: c.milestones.map((m) => ({ key: m.id, title: m.title, description: m.description ?? "", amount: m.amount?.toFixed(2) ?? "", percentage: m.percentage?.toFixed(2) ?? "", dueDate: ymd(m.dueDate) ?? "", status: m.status }))
                  }}
                />
              </div>
            </SectionCard>
          ) : (
            <>
              {(
                [
                  ["scope", c.scopeOfWork],
                  ["payment", c.paymentTerms],
                  ["terms", c.terms]
                ] as const
              )
                .filter(([, x]) => x)
                .map(([k, x]) => (
                  <SectionCard key={k} title={t(`c.f.${k}` as "c.f.scope")}>
                    <p className="whitespace-pre-line p-4 text-sm text-os-muted" dir="auto">
                      {x}
                    </p>
                  </SectionCard>
                ))}
              <SectionCard title={t("c.milestones")}>
                {c.milestones.length === 0 ? (
                  <p className="p-4 text-sm text-os-muted">{t("c.noMilestones")}</p>
                ) : (
                  <ul className="divide-y divide-os-line">
                    {c.milestones.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                        <span className="min-w-0 flex-1 font-medium">{m.title}</span>
                        <span className="text-xs text-os-muted">{m.dueDate ? fmtDate(m.dueDate, locale) : "—"}</span>
                        <span className="tabular text-xs" dir="ltr">
                          {m.amount ? money(m.amount) : m.percentage ? `${m.percentage.toFixed(2)}%` : "—"}
                        </span>
                        {eligibility[m.id] && (
                          <Badge tone={eligibility[m.id].eligible ? "success" : "neutral"}>{eligibility[m.id].eligible ? tp("eligible") : tp("deliveryInProgress")}</Badge>
                        )}
                        <MilestoneStatus contractId={c.id} milestoneId={m.id} status={m.status} enabled={!closed && can(ctx, "sales.contracts.edit")} />
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </>
          )}
        </div>
        <SectionCard title={t("c.summary")}>
          <dl className="grid gap-2 p-4 text-xs">
            {(
              [
                [t("q.subtotal"), money(c.subtotal)],
                [t("q.discount"), `−${money(c.discountTotal)}`],
                [t("c.vat"), money(c.taxTotal)],
                [t("c.value"), money(c.contractValue)],
                [t("c.f.start"), c.startDate ? fmtDate(c.startDate, locale) : "—"],
                [t("c.f.end"), c.endDate ? fmtDate(c.endDate, locale) : "—"],
                [t("c.f.renewal"), c.renewalDate ? fmtDate(c.renewalDate, locale) : "—"],
                [t("c.signedAt"), c.signedAt ? fmtDate(c.signedAt, locale) : "—"],
                [t("c.activatedAt"), c.activatedAt ? fmtDateTime(c.activatedAt, locale) : "—"],
                [t("c.acceptedVersion"), c.quotationVersion ? `V${c.quotationVersion.versionNumber} · ${c.quotationVersion.contentHash?.slice(0, 12) ?? ""}…` : "—"]
              ] as [string, string][]
            ).map(([k, x]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-2">
                <dt className="text-os-muted">{k}</dt>
                <dd className="tabular" dir="auto">
                  {x}
                </dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>
    </div>
  );
}
