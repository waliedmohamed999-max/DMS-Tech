import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Ctx } from "@/server/context";
import { documentsFor, type EntityRef } from "@/server/ops/documents";
import { classTone } from "@/lib/os/ops-page";
import { Badge, fmtDate, SectionCard } from "@/components/os/ui";
import { UploadForm } from "./OpsForms";

/**
 * Documents attached to a record. Only documents the viewer may open are listed (record permissions +
 * classification); the upload offers only classifications the viewer may file on this record.
 */
export async function DocumentsPanel({ ctx, entity, title }: { ctx: Ctx; entity: EntityRef; title?: string }) {
  const t = await getTranslations("os.ops");
  const locale = await getLocale();
  const d = await documentsFor(ctx, entity);
  if (!d) return null;
  const classes = (["INTERNAL", "CONFIDENTIAL", "RESTRICTED"] as const).filter((c, i) => d.level >= i + 1);
  return (
    <SectionCard
      title={title ?? t("documents")}
      action={
        d.canCreate && classes.length ? (
          <UploadForm
            endpoint="/app/documents/upload"
            trigger={`+ ${t("a.attach")}`}
            triggerClass="os-btn-ghost h-7 px-2 text-xs"
            note={t("uploadNote")}
            fields={[
              { name: "entityType", label: "", type: "hidden", value: entity.type },
              { name: "entityId", label: "", type: "hidden", value: entity.id },
              { name: "title", label: t("f.title"), required: true, span: true },
              { name: "classification", label: t("f.classification"), type: "select", value: "INTERNAL", options: classes.map((c) => ({ value: c, label: t(`cls.${c}` as "cls.INTERNAL") })) },
              { name: "tags", label: t("f.tags"), hint: t("tagsHint") },
              { name: "description", label: t("f.description"), type: "textarea" }
            ]}
          />
        ) : undefined
      }
    >
      {d.docs.length === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-os-faint">{t("noDocuments")}</p>
      ) : (
        <ul className="divide-y divide-os-line text-sm">
          {d.docs.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <Link href={`/app/documents/${x.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-iris-light">
                {x.title}
              </Link>
              <Badge tone={classTone(x.classification)}>{t(`cls.${x.classification}` as "cls.INTERNAL")}</Badge>
              <span className="text-[11px] text-os-faint">
                v{x.currentVersion} · {fmtDate(x.updatedAt, locale)}
              </span>
              <a href={`/app/documents/${x.id}/download`} className="os-btn-ghost h-7 px-2 text-xs" download>
                {t("a.download")}
              </a>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
