import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { listTemplates } from "@/server/projects/templates";
import { Badge, PageHeader, PermissionDenied } from "@/components/os/ui";
import { TemplateEditor } from "@/components/projects/TemplateEditor";

export const metadata = { title: "Project templates" };

export default async function TemplatesPage() {
  const { ctx, allowed } = await pageCtx("projects.templates.manage");
  if (!allowed) return <PermissionDenied permission="projects.templates.manage" />;
  const locale = await getLocale();
  const t = await getTranslations("os.projects");
  const [rows, services] = await Promise.all([listTemplates(ctx, { includeInactive: true }), prisma.service.findMany({ where: { organizationId: ctx.organizationId, active: true }, orderBy: { nameEn: "asc" }, select: { id: true, nameAr: true, nameEn: true } })]);
  const svc = services.map((s) => ({ id: s.id, label: locale === "ar" ? s.nameAr : s.nameEn }));
  return (
    <div className="grid gap-5">
      <PageHeader icon="LayoutTemplate" title={t("templates")} subtitle={t("tpl.subtitle")} actions={<TemplateEditor initial={null} services={svc} label={t("tpl.new")} />} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((tp) => {
          const tasks = tp.milestones.reduce((s, m) => s + m.tasks.length, 0);
          const hours = tp.milestones.reduce((s, m) => s + m.tasks.reduce((a, x) => a + (x.estimateMinutes ?? 0), 0), 0) / 60;
          return (
            <div key={tp.id} className="os-card grid content-start gap-2 p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{locale === "ar" ? tp.nameAr : tp.nameEn}</p>
                  <p className="text-[11px] text-os-faint" dir="ltr">
                    {tp.code}
                  </p>
                </div>
                {!tp.active && <Badge>{t("tpl.inactive")}</Badge>}
                <TemplateEditor
                  label={t("edit")}
                  services={svc}
                  initial={{
                    id: tp.id,
                    code: tp.code,
                    nameAr: tp.nameAr,
                    nameEn: tp.nameEn,
                    descriptionAr: tp.descriptionAr ?? "",
                    descriptionEn: tp.descriptionEn ?? "",
                    serviceId: tp.serviceId ?? "",
                    active: tp.active,
                    milestones: tp.milestones.map((m) => ({ titleAr: m.titleAr, titleEn: m.titleEn, weight: String(m.weight), offsetDays: String(m.offsetDays), tasks: m.tasks.map((x) => ({ titleAr: x.titleAr, titleEn: x.titleEn, estimateHours: x.estimateMinutes ? String(x.estimateMinutes / 60) : "", role: x.role ?? "" })) }))
                  }}
                />
              </div>
              <p className="text-xs text-os-muted">
                {tp.service ? (locale === "ar" ? tp.service.nameAr : tp.service.nameEn) : t("tpl.noService")} · {t("tpl.stats", { m: tp.milestones.length, t: tasks, h: Math.round(hours) })}
              </p>
              <ol className="grid gap-1 text-xs">
                {tp.milestones.map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <span className="text-iris-light">◆</span>
                    <span className="flex-1 truncate">{locale === "ar" ? m.titleAr : m.titleEn}</span>
                    <span className="tabular text-os-faint">{m.weight}%</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </div>
  );
}
