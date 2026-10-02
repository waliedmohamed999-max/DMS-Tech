import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { isAppError } from "@/server/errors";
import { getDocument } from "@/server/ops/documents";
import { classTone, userName } from "@/lib/os/ops-page";
import { approveDocumentAction, archiveDocumentAction, documentMetaAction } from "@/lib/os/ops-actions";
import { Badge, fmtDateTime, SectionCard } from "@/components/os/ui";
import { ActionForm, RunButton } from "@/components/hr/Forms";
import { UploadForm } from "@/components/ops/OpsForms";

export const metadata = { title: "Document" };
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await pageCtx();
  const locale = await getLocale();
  const t = await getTranslations("os.ops");
  let d;
  try {
    d = await getDocument(ctx, id);
  } catch (e) {
    if (isAppError(e)) notFound();
    throw e;
  }
  const doc = d.doc;
  const latest = d.versions[0];
  const preview = latest && ["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(latest.mime);
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/documents" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">{doc.number}</p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {doc.title}
            <Badge tone={classTone(doc.classification)} dot>
              {t(`cls.${doc.classification}` as "cls.INTERNAL")}
            </Badge>
            {doc.status !== "ACTIVE" && <Badge tone={doc.status === "IN_REVIEW" ? "warning" : "neutral"}>{t(`dstatus.${doc.status}` as "dstatus.ACTIVE")}</Badge>}
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-os-muted">
            <span>{t(`dcat.${doc.category}` as "dcat.COMPANY")}</span>
            {d.access.entity.href ? (
              <Link href={d.access.entity.href} className="hover:text-iris-light">
                {d.access.entity.label}
              </Link>
            ) : (
              <span>{t("companyWide")}</span>
            )}
            <span>{t("owner")}: {userName(d.people, doc.ownerId, locale)}</span>
            {doc.tags.map((x) => (
              <span key={x} className="text-iris-light" dir="ltr">#{x}</span>
            ))}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {latest && (
            <a href={`/app/documents/${id}/download`} className="os-btn-primary" download>
              {t("a.downloadLatest")}
            </a>
          )}
          {preview && (
            <a href={`/app/documents/${id}/download?inline=1`} target="_blank" rel="noopener" className="os-btn-ghost">
              {t("a.preview")}
            </a>
          )}
          {d.can.review && <RunButton action={approveDocumentAction} args={[id]} label={t("a.approveReview")} className="os-btn-secondary" />}
          {d.can.version && (
            <UploadForm endpoint={`/app/documents/${id}/versions`} trigger={`+ ${t("a.newVersion")}`} triggerClass="os-btn-secondary" note={t("versionNote")} fields={[{ name: "note", label: t("f.versionNote"), type: "textarea" }]} />
          )}
          {d.can.edit && (
            <ActionForm
              action={documentMetaAction}
              args={[id]}
              trigger={t("a.edit")}
              triggerClass="os-btn-ghost"
              submitLabel={t("a.save")}
              fields={[
                { name: "title", label: t("f.title"), required: true, value: doc.title },
                { name: "classification", label: t("f.classification"), type: "select", required: true, value: doc.classification, options: (doc.entityType ? ["INTERNAL", "CONFIDENTIAL", "RESTRICTED"] : ["PUBLIC_INTERNAL", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]).map((c) => ({ value: c, label: t(`cls.${c}` as "cls.INTERNAL") })) },
                { name: "tags", label: t("f.tags"), value: doc.tags.join(", ") },
                { name: "description", label: t("f.description"), type: "textarea", value: doc.description ?? "" }
              ]}
            />
          )}
          {d.can.archive && <ActionForm action={archiveDocumentAction} args={[id]} trigger={t("a.archive")} triggerClass="os-btn-ghost" submitLabel={t("a.archive")} danger fields={[{ name: "reason", label: t("f.reason"), type: "textarea", required: true }]} />}
        </div>
      </div>
      {doc.description && <p className="os-card whitespace-pre-line p-4 text-sm" dir="auto">{doc.description}</p>}
      {doc.status === "IN_REVIEW" && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm">
          {t("awaitingReviewBy", { name: userName(d.people, doc.reviewerId, locale) ?? "—" })}
        </p>
      )}
      <SectionCard title={t("versions")}>
        <ul className="divide-y divide-os-line text-sm">
          {d.versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <Badge tone={v.versionNumber === doc.currentVersion ? "iris" : "neutral"}>v{v.versionNumber}</Badge>
              <span className="min-w-0 flex-1 truncate" dir="auto">
                {v.originalName}
                <span className="block text-[11px] text-os-faint">
                  {userName(d.people, v.uploadedById, locale)} · {fmtDateTime(v.createdAt, locale)} · <span dir="ltr">{kb(v.size)}</span> · {t(`scan.${v.scanStatus}` as "scan.NOT_SCANNED")}
                </span>
                {v.note && <span className="block text-[11px] text-os-muted">{v.note}</span>}
              </span>
              <code className="hidden text-[10px] text-os-faint md:inline" dir="ltr" title="SHA-256">
                {v.sha256.slice(0, 12)}…
              </code>
              <a href={`/app/documents/${id}/download?v=${v.versionNumber}`} className="os-btn-ghost h-7 px-2 text-xs" download>
                {t("a.download")}
              </a>
            </li>
          ))}
        </ul>
        <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("versionsNote")}</p>
      </SectionCard>
    </div>
  );
}
