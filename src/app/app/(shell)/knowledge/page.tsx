import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { listKbCategories, searchArticles } from "@/server/ops/knowledge";
import { kbTone, opsOptions } from "@/lib/os/ops-page";
import { createArticleAction } from "@/lib/os/ops-actions";
import { Badge, EmptyState, flatParams, fmtDate, PageHeader, PermissionDenied, SectionCard } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { ActionForm } from "@/components/hr/Forms";

export const metadata = { title: "Knowledge base" };

/** Internal knowledge: plain search over published titles / bodies / tags (both languages). No AI, no embeddings. */
export default async function KnowledgePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("knowledge.view");
  if (!allowed) return <PermissionDenied permission="knowledge.view" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.ops");
  const [res, cats, opts, roles] = await Promise.all([
    searchArticles(ctx, sp),
    listKbCategories(ctx.organizationId),
    can(ctx, "knowledge.create") ? opsOptions(ctx, locale, { departments: true }) : Promise.resolve(null),
    can(ctx, "knowledge.create") ? prisma.role.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" }, select: { key: true, name: true, nameAr: true } }) : Promise.resolve([])
  ]);
  const catOpts = cats.map((c) => ({ value: c.id, label: locale === "ar" ? c.nameAr : c.nameEn }));
  const title = (a: { titleAr: string; titleEn: string }) => (locale === "ar" ? a.titleAr : a.titleEn);
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="Lightbulb"
        title={t("knowledge")}
        subtitle={t("knowledgeSubtitle")}
        actions={
          opts ? (
            <ActionForm
              action={createArticleAction}
              trigger={`+ ${t("a.newArticle")}`}
              submitLabel={t("a.saveDraft")}
              redirect="/app/knowledge/:id"
              autoOpen={sp.new === "1"}
              onCloseHref="/app/knowledge"
              note={t("articleNote")}
              fields={[
                { name: "titleAr", label: t("f.titleAr"), required: true, dir: "rtl" },
                { name: "titleEn", label: t("f.titleEn"), required: true, dir: "ltr" },
                { name: "bodyAr", label: t("f.bodyAr"), type: "textarea", required: true, dir: "rtl" },
                { name: "bodyEn", label: t("f.bodyEn"), type: "textarea", required: true, dir: "ltr" },
                { name: "categoryId", label: t("f.category"), type: "select", required: true, options: catOpts },
                { name: "visibility", label: t("f.visibility"), type: "select", required: true, value: "ALL_EMPLOYEES", options: ["ALL_EMPLOYEES", "DEPARTMENT", "ROLE_RESTRICTED", "SUPPORT_ONLY"].map((v) => ({ value: v, label: t(`kvis.${v}` as "kvis.ALL_EMPLOYEES") })) },
                { name: "departmentId", label: t("f.department"), type: "select", options: opts.departments, hint: t("deptHint") },
                { name: "roleKeys", label: t("f.roles"), type: "multiselect", options: roles.map((r) => ({ value: r.key, label: (locale === "ar" && r.nameAr) || r.name })), hint: t("rolesHint") },
                { name: "tags", label: t("f.tags"), hint: t("kbTagsHint") }
              ]}
            />
          ) : undefined
        }
      />
      <div className="os-card overflow-hidden">
        <FilterBar search={{ placeholder: t("searchKnowledge") }} selects={[{ name: "category", allLabel: `${t("f.category")}: ${t("all")}`, options: catOpts }]} />
        {res.published.length === 0 ? (
          <EmptyState icon="Lightbulb" title={sp.q ? t("noArticles") : t("noPublished")} text={t("noPublishedText")} />
        ) : (
          <ul className="divide-y divide-os-line">
            {res.published.map((a) => {
              const v = a.publishedVersion!;
              const body = locale === "ar" ? v.bodyAr : v.bodyEn;
              return (
                <li key={a.id} className="px-4 py-3">
                  <Link href={`/app/knowledge/${a.id}`} className="font-medium hover:text-iris-light">
                    {title(v)}
                  </Link>
                  <p className="mt-0.5 line-clamp-2 text-xs text-os-muted" dir="auto">{body}</p>
                  <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-os-faint">
                    <span dir="ltr">{a.number}</span>
                    <span>{locale === "ar" ? a.category.nameAr : a.category.nameEn}</span>
                    {a.visibility !== "ALL_EMPLOYEES" && <span className="text-warning">{t(`kvis.${a.visibility}` as "kvis.ALL_EMPLOYEES")}</span>}
                    {a.publishedAt && <span>{fmtDate(a.publishedAt, locale)}</span>}
                    {a.tags.map((x) => (
                      <span key={x} className="text-iris-light" dir="ltr">#{x}</span>
                    ))}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {res.work.length > 0 && (
        <SectionCard title={res.staff ? t("workQueue") : t("myDrafts")}>
          <ul className="divide-y divide-os-line text-sm">
            {res.work.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <Link href={`/app/knowledge/${a.id}`} className="min-w-0 flex-1 truncate hover:text-iris-light">
                  <span className="text-[11px] text-os-faint" dir="ltr">{a.number}</span> {title(a)}
                </Link>
                {a.publishedVersionId && <span className="text-[10px] text-os-faint">{t("hasLiveVersion")}</span>}
                <Badge tone={kbTone(a.status)}>{t(`kstatus.${a.status}` as "kstatus.DRAFT")}</Badge>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
