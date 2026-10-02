import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { listDocuments } from "@/server/ops/documents";
import { classTone, opsOptions } from "@/lib/os/ops-page";
import { Badge, EmptyState, flatParams, fmtDate, PageHeader, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { UploadForm } from "@/components/ops/OpsForms";

export const metadata = { title: "Documents" };
const CATEGORIES = ["COMPANY", "CLIENT", "CONTRACT", "PROJECT", "FINANCE", "HR", "VENDOR", "PROCUREMENT", "ASSET", "LEGAL", "OTHER"];
const CLASSES = ["PUBLIC_INTERNAL", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"];

/** Metadata search over documents the viewer may open (record permissions + classification). No content search / OCR. */
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("documents.view");
  if (!allowed) return <PermissionDenied permission="documents.view" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.ops");
  const [docs, opts] = await Promise.all([listDocuments(ctx, sp), can(ctx, "documents.manage") ? opsOptions(ctx, locale, { users: true }) : Promise.resolve(null)]);
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="FileSearch"
        title={t("documents")}
        subtitle={t("documentsSubtitle")}
        actions={
          opts ? (
            <UploadForm
              endpoint="/app/documents/upload"
              trigger={`+ ${t("a.companyDocument")}`}
              redirectTo="/app/documents/:id"
              note={t("companyUploadNote")}
              fields={[
                { name: "title", label: t("f.title"), required: true, span: true },
                { name: "category", label: t("f.category"), type: "select", value: "COMPANY", options: ["COMPANY", "LEGAL", "OTHER"].map((c) => ({ value: c, label: t(`dcat.${c}` as "dcat.COMPANY") })) },
                { name: "classification", label: t("f.classification"), type: "select", value: "INTERNAL", options: CLASSES.map((c) => ({ value: c, label: t(`cls.${c}` as "cls.INTERNAL") })) },
                { name: "tags", label: t("f.tags"), hint: t("tagsHint") },
                { name: "reviewerId", label: t("f.reviewer"), type: "select", options: opts.users, hint: t("reviewerHint") },
                { name: "description", label: t("f.description"), type: "textarea" }
              ]}
            />
          ) : undefined
        }
      />
      <nav className="flex gap-1">
        {[
          ["", t("scope.active")],
          ["review", t("scope.myReview")],
          ["archived", t("scope.archived")]
        ].map(([k, l]) => (
          <Link key={k || "all"} href={k === "review" ? "?review=1" : k === "archived" ? "?status=archived" : "?"} className={`rounded-full border px-3 py-1 text-xs ${(k === "review" ? sp.review === "1" : k === "archived" ? sp.status === "archived" : !sp.review && !sp.status) ? "border-iris bg-iris/10 text-os-text" : "border-os-line text-os-muted hover:text-os-text"}`}>
            {l}
          </Link>
        ))}
      </nav>
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t("searchDocuments") }}
          selects={[
            { name: "category", allLabel: `${t("f.category")}: ${t("all")}`, options: CATEGORIES.map((c) => ({ value: c, label: t(`dcat.${c}` as "dcat.COMPANY") })) },
            { name: "classification", allLabel: `${t("f.classification")}: ${t("all")}`, options: CLASSES.map((c) => ({ value: c, label: t(`cls.${c}` as "cls.INTERNAL") })) }
          ]}
        />
        {docs.length === 0 ? (
          <EmptyState icon="FileSearch" title={t("noDocuments")} text={t("noDocumentsText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.document")}</th>
                  <th className="hidden md:table-cell">{t("f.linkedTo")}</th>
                  <th>{t("f.classification")}</th>
                  <th className="hidden md:table-cell">{t("f.updated")}</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td className="min-w-[200px]">
                      <Link href={`/app/documents/${d.id}`} className="font-medium hover:text-iris-light">
                        {d.title}
                      </Link>
                      <span className="block text-[11px] text-os-faint">
                        <span dir="ltr">{d.number}</span> · {t(`dcat.${d.category}` as "dcat.COMPANY")} · v{d.currentVersion}
                        {d.status === "IN_REVIEW" && <span className="text-warning"> · {t("inReview")}</span>}
                      </span>
                    </td>
                    <td className="hidden text-xs md:table-cell">
                      {d.entity.href ? (
                        <Link href={d.entity.href} className="text-os-muted hover:text-iris-light">
                          {d.entity.label}
                        </Link>
                      ) : (
                        <span className="text-os-faint">{t("companyWide")}</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={classTone(d.classification)}>{t(`cls.${d.classification}` as "cls.INTERNAL")}</Badge>
                    </td>
                    <td className="hidden whitespace-nowrap text-xs text-os-muted md:table-cell">{fmtDate(d.updatedAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("documentsListNote")}</p>
      </div>
    </div>
  );
}
