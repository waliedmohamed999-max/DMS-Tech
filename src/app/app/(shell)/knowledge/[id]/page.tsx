import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { isAppError } from "@/server/errors";
import { getArticle, listKbCategories } from "@/server/ops/knowledge";
import { kbTone, opsOptions, userName } from "@/lib/os/ops-page";
import { archiveArticleAction, publishArticleAction, returnArticleAction, submitArticleAction, updateArticleAction } from "@/lib/os/ops-actions";
import { Badge, fmtDateTime, SectionCard } from "@/components/os/ui";
import { ActionForm, RunButton } from "@/components/hr/Forms";

export const metadata = { title: "Knowledge article" };

export default async function ArticlePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ draft?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { ctx } = await pageCtx();
  const locale = await getLocale();
  const t = await getTranslations("os.ops");
  let d;
  try {
    d = await getArticle(ctx, id);
  } catch (e) {
    if (isAppError(e)) notFound();
    throw e;
  }
  const a = d.article;
  const live = a.publishedVersion;
  // readers see the live version only; editors may switch to the working copy
  const showDraft = d.editor && (sp.draft === "1" || !live);
  const content = showDraft ? a : live!;
  const [cats, opts, roles] = d.can.edit
    ? await Promise.all([listKbCategories(ctx.organizationId), opsOptions(ctx, locale, { departments: true }), prisma.role.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" }, select: { key: true, name: true, nameAr: true } })])
    : [[], null, []];
  const ar = locale === "ar";
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/knowledge" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">
            {a.number}
            {live ? ` · v${live.version}` : ""}
          </p>
          <h1 className="text-xl font-semibold">{ar ? content.titleAr : content.titleEn}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-os-muted">
            <span>{ar ? a.category.nameAr : a.category.nameEn}</span>
            <span>{t(`kvis.${a.visibility}` as "kvis.ALL_EMPLOYEES")}{a.department ? ` · ${(ar && a.department.nameAr) || a.department.name}` : ""}{a.roleKeys.length ? ` · ${a.roleKeys.join(", ")}` : ""}</span>
            {a.publishedAt && <span>{t("publishedOn")} {fmtDateTime(a.publishedAt, locale)}</span>}
            {d.editor && <Badge tone={kbTone(a.status)}>{t(`kstatus.${a.status}` as "kstatus.DRAFT")}</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {d.editor && live && (
            <Link href={showDraft ? "?" : "?draft=1"} className="os-btn-ghost">
              {showDraft ? t("a.viewLive") : t("a.viewDraft")}
            </Link>
          )}
          {d.can.submit && <RunButton action={submitArticleAction} args={[id]} label={t("a.submitReview")} className="os-btn-secondary" />}
          {d.can.review && <ActionForm action={returnArticleAction} args={[id]} trigger={t("a.returnDraft")} triggerClass="os-btn-ghost" submitLabel={t("a.returnDraft")} fields={[{ name: "comment", label: t("f.reviewComment"), type: "textarea", required: true }]} />}
          {d.can.publish && <RunButton action={publishArticleAction} args={[id]} label={t("a.publish")} className="os-btn-primary" confirmText={t("publishConfirm")} />}
          {d.can.edit && opts && (
            <ActionForm
              action={updateArticleAction}
              args={[id]}
              trigger={t("a.edit")}
              triggerClass="os-btn-ghost"
              submitLabel={t("a.save")}
              note={live ? t("editLiveNote") : undefined}
              fields={[
                { name: "titleAr", label: t("f.titleAr"), required: true, dir: "rtl", value: a.titleAr },
                { name: "titleEn", label: t("f.titleEn"), required: true, dir: "ltr", value: a.titleEn },
                { name: "bodyAr", label: t("f.bodyAr"), type: "textarea", required: true, dir: "rtl", value: a.bodyAr },
                { name: "bodyEn", label: t("f.bodyEn"), type: "textarea", required: true, dir: "ltr", value: a.bodyEn },
                { name: "categoryId", label: t("f.category"), type: "select", required: true, value: a.categoryId, options: cats.map((c) => ({ value: c.id, label: ar ? c.nameAr : c.nameEn })) },
                { name: "visibility", label: t("f.visibility"), type: "select", required: true, value: a.visibility, options: ["ALL_EMPLOYEES", "DEPARTMENT", "ROLE_RESTRICTED", "SUPPORT_ONLY"].map((v) => ({ value: v, label: t(`kvis.${v}` as "kvis.ALL_EMPLOYEES") })) },
                { name: "departmentId", label: t("f.department"), type: "select", options: opts.departments, value: a.departmentId ?? "" },
                { name: "roleKeys", label: t("f.roles"), type: "multiselect", value: a.roleKeys, options: roles.map((r) => ({ value: r.key, label: (ar && r.nameAr) || r.name })) },
                { name: "tags", label: t("f.tags"), value: a.tags.join(", ") }
              ]}
            />
          )}
          {d.can.archive && <RunButton action={archiveArticleAction} args={[id]} label={t("a.archive")} className="os-btn-ghost" confirmText={t("archiveConfirm")} />}
        </div>
      </div>
      {a.reviewComment && d.editor && a.status === "DRAFT" && <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm">{t("returnedWith", { c: a.reviewComment })}</p>}
      {showDraft && live && <p className="rounded-lg border border-iris/40 bg-iris/10 px-4 py-2 text-xs">{t("viewingDraft")}</p>}
      {!live && <p className="rounded-lg border border-os-line bg-os-panel px-4 py-2 text-xs text-os-muted">{t("notPublishedYet")}</p>}
      <article className="os-card grid gap-4 p-5">
        <div className="whitespace-pre-line text-sm leading-7" dir={ar ? "rtl" : "ltr"}>
          {ar ? content.bodyAr : content.bodyEn}
        </div>
        <details className="border-t border-os-line pt-3 text-xs text-os-muted">
          <summary className="cursor-pointer">{ar ? "English version" : "النسخة العربية"}</summary>
          <h2 className="mt-2 font-semibold text-os-text" dir={ar ? "ltr" : "rtl"}>{ar ? content.titleEn : content.titleAr}</h2>
          <div className="mt-1 whitespace-pre-line leading-6" dir={ar ? "ltr" : "rtl"}>
            {ar ? content.bodyEn : content.bodyAr}
          </div>
        </details>
      </article>
      {a.tags.length > 0 && (
        <p className="flex flex-wrap gap-2 text-xs">
          {a.tags.map((x) => (
            <Link key={x} href={`/app/knowledge?q=${encodeURIComponent(x)}`} className="rounded-full border border-os-line px-2 py-0.5 text-iris-light" dir="ltr">
              #{x}
            </Link>
          ))}
        </p>
      )}
      {d.editor && a.versions.length > 0 && (
        <SectionCard title={t("publishHistory")}>
          <ul className="divide-y divide-os-line text-xs">
            {a.versions.map((v) => (
              <li key={v.id} className="flex items-center gap-2 px-4 py-2">
                <Badge tone={v.id === a.publishedVersionId ? "success" : "neutral"}>v{v.version}</Badge>
                <span className="flex-1">{userName(d.people, v.publishedById, locale)}</span>
                <span className="text-os-faint">{fmtDateTime(v.createdAt, locale)}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("versionsImmutable")}</p>
        </SectionCard>
      )}
    </div>
  );
}
