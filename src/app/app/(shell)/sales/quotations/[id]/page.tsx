import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { getQuotation } from "@/server/commercial/quotations";
import { sweepIfDue } from "@/server/commercial/sweep";
import { personName } from "@/lib/os/crm-page";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, fmtDate, fmtDateTime, PermissionDenied, SectionCard } from "@/components/os/ui";
import QuoteActions from "@/components/sales/QuoteActions";
import { quoteStatusTone } from "@/components/sales/tones";
import { Icon } from "@/components/ui/Icon";

export const metadata = { title: "Quotation" };

const TABS = ["overview", "approvals", "versions", "activity"] as const;

export default async function QuotationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; v?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : "overview";
  const { ctx, allowed } = await pageCtx("sales.quotations.view");
  if (!allowed) return <PermissionDenied permission="sales.quotations.view" />;
  await sweepIfDue(ctx.organizationId);
  const locale = await getLocale();
  const t = await getTranslations("os.sales");
  let d;
  try {
    d = await getQuotation(ctx, id, Number(sp.v) || undefined);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { quotation: q, version: v, isCurrent, approvals, documents, users } = d;
  const who = (uid: string | null) => personName(users.find((u) => u.id === uid), locale);
  const money = (x: { toFixed(n: number): string }) => formatMoney(x.toFixed(2), locale, v.currency);
  const reasons = (v.approvalReasons as { code: string; value?: string; limit?: string }[] | null) ?? [];
  const contract = q.contracts.find((c) => c.status !== "CANCELLED" && c.quotationVersionId === q.acceptedVersionId) ?? null;
  const activity =
    tab === "activity"
      ? await prisma.crmActivity.findMany({ where: { organizationId: ctx.organizationId, OR: [{ metadata: { path: ["quotationId"], equals: q.id } }, { metadata: { path: ["quotationNumber"], equals: q.number } }] }, orderBy: { occurredAt: "desc" }, take: 100, include: { createdBy: { select: { name: true, nameAr: true } } } })
      : [];
  const doc = documents.find((x) => x.quotationVersionId === v.id);
  // Phase 4: a project may start from an accepted quotation only when company policy allows it and no contract exists.
  const tp = await getTranslations("os.projects");
  const [org, liveProject] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { projectFromQuotationAllowed: true } }),
    prisma.project.findFirst({ where: { quotationId: q.id, status: { not: "CANCELLED" } }, select: { id: true, number: true } })
  ]);
  const canProjectFromQuote = org.projectFromQuotationAllowed && v.status === "ACCEPTED" && isCurrent && !contract && !liveProject && can(ctx, "projects.create");

  return (
    <div className="grid gap-5">
      {/* header */}
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/sales/quotations" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint">{t("q.quotation")}</p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            <span dir="ltr">{q.number}</span>
            <span className="rounded-md bg-os-raised px-2 py-0.5 text-sm font-medium text-os-muted" dir="ltr">
              V{v.versionNumber}
            </span>
            <Badge tone={quoteStatusTone(v.status)} dot>
              {t(`qStatus.${v.status}` as "qStatus.DRAFT")}
            </Badge>
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-os-muted">
            <Link href={`/app/crm/clients/${q.client.id}?tab=quotations`} className="hover:text-iris-light">
              {q.client.displayName}
            </Link>
            {q.opportunity && (
              <Link href={`/app/crm/opportunities/${q.opportunity.id}?tab=quotations`} className="hover:text-iris-light">
                {q.opportunity.number} · {q.opportunity.title}
              </Link>
            )}
            <span>
              {t("q.f.owner")}: {personName(q.owner, locale) ?? "—"}
            </span>
          </p>
        </div>
        <div className="text-end">
          <p className="text-xs text-os-faint">{t("q.total")}</p>
          <p className="text-2xl font-semibold tabular" dir="ltr">
            {money(v.total)}
          </p>
        </div>
      </div>

      {!isCurrent && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          {t("q.oldVersion")}{" "}
          <Link href={`/app/sales/quotations/${q.id}`} className="underline">
            {t("q.openCurrent")}
          </Link>
        </p>
      )}
      {v.status === "DRAFT" && v.approvalComment && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {t("q.approvalRejected")}: {v.approvalComment}
        </p>
      )}
      {v.status === "PENDING_APPROVAL" && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          <p className="font-medium">{t("q.pendingApproval")}</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {reasons.map((r) => (
              <li key={r.code}>
                {t(`reasons.${r.code}` as "reasons.TOTAL_ABOVE_THRESHOLD")}
                {r.value && r.limit ? ` (${r.value} > ${r.limit})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {v.status === "REJECTED" && v.rejectionReason && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {t("q.clientRejectedReason")}: {v.rejectionReason}
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <a href={`/app/sales/quotations/${q.id}/pdf?v=${v.versionNumber}`} target="_blank" rel="noopener" className="os-btn-secondary">
            <Icon name="FileText" size={14} /> {t("qa.pdf")}
          </a>
          <a href={`/app/sales/quotations/${q.id}/pdf?v=${v.versionNumber}&download=1`} className="os-btn-ghost">
            {t("qa.download")}
          </a>
          {liveProject && can(ctx, "projects.view") && (
            <Link href={`/app/projects/${liveProject.id}`} className="os-btn-secondary">
              <Icon name="Layers" size={14} /> <span dir="ltr">{liveProject.number}</span>
            </Link>
          )}
          {canProjectFromQuote && (
            <Link href={`/app/projects/new?quotation=${q.id}`} className="os-btn-secondary">
              <Icon name="Layers" size={14} /> {tp("createProject")}
            </Link>
          )}
        </div>
        <QuoteActions
          id={q.id}
          versionId={v.id}
          status={v.status}
          isCurrent={isCurrent}
          hasOpenOpportunity={q.opportunity?.status === "OPEN"}
          contractId={contract?.id ?? null}
          can={{
            edit: can(ctx, "sales.quotations.edit"),
            submit: can(ctx, "sales.quotations.submit"),
            send: can(ctx, "sales.quotations.send"),
            accept: can(ctx, "sales.quotations.accept"),
            reject: can(ctx, "sales.quotations.reject"),
            cancel: can(ctx, "sales.quotations.cancel"),
            create: can(ctx, "sales.quotations.create"),
            contract: can(ctx, "sales.contracts.create"),
            markWon: can(ctx, "crm.opportunities.mark_won")
          }}
        />
      </div>

      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-os-line">
        {TABS.map((k) => (
          <Link key={k} href={`?tab=${k}${sp.v ? `&v=${sp.v}` : ""}`} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === k ? "border-iris text-os-text" : "border-transparent text-os-muted hover:text-os-text"}`}>
            {t(`q.tabs.${k}` as "q.tabs.overview")}
            {k === "versions" && <span className="ms-1 text-os-faint tabular">{q.versions.length}</span>}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
          <div className="grid gap-5">
            <SectionCard title={t("q.items")}>
              <div className="overflow-x-auto">
                <table className="os-table">
                  <thead>
                    <tr>
                      <th>{t("q.f.item")}</th>
                      <th>{t("q.f.qty")}</th>
                      <th>{t("q.f.price")}</th>
                      <th>{t("q.f.discount")}</th>
                      <th>{t("q.f.tax")}</th>
                      <th className="text-end">{t("q.f.lineTotal")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.items.map((i) => (
                      <tr key={i.id}>
                        <td className="min-w-[220px]">
                          <span className="flex items-center gap-1.5 font-medium">
                            {(i.serviceId || i.packageId) && <span className="rounded bg-iris/15 px-1.5 py-0.5 text-[10px] text-iris-light">{i.packageId ? t("q.pkg") : t("q.svc")}</span>}
                            {i.name}
                          </span>
                          {i.description && <span className="mt-0.5 block whitespace-pre-line text-xs text-os-muted">{i.description}</span>}
                        </td>
                        <td className="whitespace-nowrap tabular" dir="ltr">
                          {i.quantity.toFixed(3).replace(/\.?0+$/, "")} {i.unit}
                        </td>
                        <td className="whitespace-nowrap tabular" dir="ltr">
                          {money(i.unitPrice)}
                          {i.catalogUnitPrice && !i.catalogUnitPrice.equals(i.unitPrice) && i.catalogUnitPrice.gt(0) && (
                            <span className="block text-[10.5px] text-warning" title={t("q.catalogPrice")}>
                              {t("q.catalog")}: {money(i.catalogUnitPrice)}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap tabular text-xs" dir="ltr">
                          {i.discountType === "NONE" ? "—" : `${i.discountType === "PERCENT" ? `${i.discountValue.toFixed(2)}%` : ""} −${money(i.discountAmount)}`}
                        </td>
                        <td className="whitespace-nowrap tabular text-xs" dir="ltr">
                          {i.taxRate.toFixed(2)}%
                        </td>
                        <td className="whitespace-nowrap text-end font-semibold tabular" dir="ltr">
                          {money(i.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
            <div className="grid gap-5 lg:grid-cols-2">
              {(
                [
                  ["paymentTerms", v.paymentTerms],
                  ["deliveryTerms", v.deliveryTerms],
                  ["clientMessage", v.clientMessage],
                  ["notes", v.notes]
                ] as const
              )
                .filter(([, x]) => x)
                .map(([k, x]) => (
                  <SectionCard key={k} title={t(`q.f.${k}` as "q.f.notes")}>
                    <p className="whitespace-pre-line p-4 text-sm text-os-muted" dir="auto">
                      {x}
                    </p>
                  </SectionCard>
                ))}
            </div>
            {v.termsAndConditions && (
              <SectionCard title={t("q.f.terms")}>
                <p className="whitespace-pre-line p-4 text-sm text-os-muted" dir="auto">
                  {v.termsAndConditions}
                </p>
              </SectionCard>
            )}
          </div>
          <div className="grid gap-5 xl:sticky xl:top-20">
            <SectionCard title={t("q.summary")}>
              <dl className="grid gap-1.5 p-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-os-muted">{t("q.subtotal")}</dt>
                  <dd className="tabular" dir="ltr">{money(v.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-os-muted">{t("q.discount")}</dt>
                  <dd className="tabular text-danger" dir="ltr">−{money(v.discountTotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-os-muted">{t("q.vat", { r: v.vatRate.toFixed(2) })}</dt>
                  <dd className="tabular" dir="ltr">{money(v.taxTotal)}</dd>
                </div>
                <div className="mt-1 flex justify-between border-t border-os-line pt-2 text-base font-semibold">
                  <dt>{t("q.total")}</dt>
                  <dd className="tabular" dir="ltr">{money(v.total)}</dd>
                </div>
              </dl>
            </SectionCard>
            <SectionCard title={t("q.details")}>
              <dl className="grid gap-2 p-4 text-xs">
                {(
                  [
                    [t("q.f.language"), v.language === "ar" ? "العربية" : "English"],
                    [t("q.f.issueDate"), fmtDate(v.issueDate, locale)],
                    [t("q.f.validUntil"), fmtDate(v.validUntil, locale)],
                    [t("q.f.contact"), q.contact ? `${q.contact.firstName} ${q.contact.lastName ?? ""}` : "—"],
                    [t("q.submittedBy"), v.submittedAt ? `${who(v.submittedById) ?? "—"} · ${fmtDateTime(v.submittedAt, locale)}` : "—"],
                    [t("q.approvedBy"), v.approvedAt ? `${v.approvedById ? who(v.approvedById) : t("q.autoApproved")} · ${fmtDateTime(v.approvedAt, locale)}` : "—"],
                    [t("q.sentBy"), v.sentAt ? `${who(v.sentById) ?? "—"} · ${t(`qa.methods.${v.sendMethod}` as "qa.methods.OTHER")} · ${fmtDateTime(v.sentAt, locale)}` : "—"],
                    ...(v.acceptedAt ? ([[t("q.acceptedBy"), `${who(v.acceptedRecordedById) ?? "—"} · ${fmtDateTime(v.acceptedAt, locale)}${v.acceptanceNote ? ` · ${v.acceptanceNote}` : ""}`]] as [string, string][]) : []),
                    ...(v.contentHash ? ([[t("q.seal"), `${v.contentHash.slice(0, 16)}…`]] as [string, string][]) : []),
                    ...(doc ? ([[t("q.sentPdf"), `sha256 ${doc.sha256.slice(0, 16)}…`]] as [string, string][]) : [])
                  ] as [string, string][]
                ).map(([k, x]) => (
                  <div key={k} className="grid grid-cols-[110px_1fr] gap-2">
                    <dt className="text-os-muted">{k}</dt>
                    <dd className="break-words" dir="auto">
                      {x}
                    </dd>
                  </div>
                ))}
              </dl>
            </SectionCard>
          </div>
        </div>
      )}

      {tab === "approvals" && (
        <SectionCard title={t("q.tabs.approvals")}>
          {approvals.length === 0 ? (
            <EmptyState icon="BadgeCheck" title={t("q.noApprovals")} text={v.approvedAt && !v.approvedById ? t("q.autoApprovedText") : t("q.noApprovalsText")} />
          ) : (
            <ul className="divide-y divide-os-line">
              {approvals.map((a) => {
                const p = a.payload as { versionNumber?: number; total?: string; discountPercent?: string; reasons?: { code: string }[] };
                return (
                  <li key={a.id} className="grid gap-1 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium" dir="ltr">
                        V{p.versionNumber}
                      </span>
                      <Badge tone={a.status === "APPROVED" ? "success" : a.status === "REJECTED" ? "danger" : a.status === "PENDING" ? "warning" : "neutral"}>{t(`approvalStatus.${a.status}` as "approvalStatus.PENDING")}</Badge>
                      <span className="tabular text-xs text-os-muted" dir="ltr">
                        {p.total ? formatMoney(p.total, locale, v.currency) : ""} · {p.discountPercent}%
                      </span>
                    </div>
                    <p className="text-xs text-os-faint">
                      {(p.reasons ?? []).map((r) => t(`reasons.${r.code}` as "reasons.TOTAL_ABOVE_THRESHOLD")).join(" · ")} · {t("q.requiredPerm")}: <code dir="ltr">{a.requiredPermission}</code>
                    </p>
                    <p className="text-xs text-os-muted">
                      {personName(a.requestedBy, locale)} · {fmtDateTime(a.createdAt, locale)}
                      {a.decidedBy && ` → ${personName(a.decidedBy, locale)} · ${a.decidedAt ? fmtDateTime(a.decidedAt, locale) : ""}`}
                    </p>
                    {a.decisionComment && <p className="rounded-md border border-os-line bg-os-panel px-3 py-1.5 text-xs text-os-muted">{a.decisionComment}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "versions" && (
        <SectionCard title={t("q.tabs.versions")}>
          <ul className="divide-y divide-os-line">
            {q.versions.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <Link href={`/app/sales/quotations/${q.id}?v=${x.versionNumber}`} className={`font-semibold hover:text-iris-light ${x.id === v.id ? "text-iris-light" : ""}`} dir="ltr">
                  V{x.versionNumber}
                </Link>
                <Badge tone={quoteStatusTone(x.status)}>{t(`qStatus.${x.status}` as "qStatus.DRAFT")}</Badge>
                <span className="tabular text-os-muted" dir="ltr">
                  {formatMoney(x.total.toFixed(2), locale, x.currency)}
                </span>
                <span className="text-xs text-os-faint">{fmtDateTime(x.createdAt, locale)}</span>
                {x.id === q.acceptedVersionId && <Badge tone="success">{t("q.acceptedVersion")}</Badge>}
                <a href={`/app/sales/quotations/${q.id}/pdf?v=${x.versionNumber}`} target="_blank" rel="noopener" className="ms-auto text-xs text-os-muted hover:text-os-text">
                  PDF
                </a>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {tab === "activity" && (
        <SectionCard title={t("q.tabs.activity")}>
          {activity.length === 0 ? (
            <EmptyState icon="ChartLine" title={t("q.noActivity")} text="" />
          ) : (
            <ul className="divide-y divide-os-line">
              {activity.map((a) => {
                const m = (a.metadata ?? {}) as { version?: number; reason?: string; method?: string };
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                    <Icon name="Clock" size={14} className="text-os-faint" />
                    <span className="font-medium">{t.has(`titles.${a.title.replace(/\./g, "_")}`) ? t(`titles.${a.title.replace(/\./g, "_")}` as "titles.quotation_created") : a.title}</span>
                    {m.version && (
                      <span className="text-xs text-os-faint" dir="ltr">
                        V{m.version}
                      </span>
                    )}
                    {m.reason && <span className="text-xs text-os-muted">· {m.reason}</span>}
                    <span className="ms-auto text-xs text-os-faint">
                      {personName(a.createdBy, locale) ?? t("q.system")} · {fmtDateTime(a.occurredAt, locale)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      )}
    </div>
  );
}
