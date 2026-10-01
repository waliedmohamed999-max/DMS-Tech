import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { listDepartments } from "@/server/admin/org";
import { prisma } from "@/server/db";
import { EmptyState, PageHeader, PermissionDenied } from "@/components/os/ui";
import { ArchiveDepartment, DepartmentEditor } from "@/components/os/AdminForms";

export const metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  const { ctx, allowed } = await pageCtx("admin.departments.manage");
  if (!allowed) return <PermissionDenied permission="admin.departments.manage" />;
  const locale = await getLocale();
  const t = await getTranslations("os");
  const [depts, people] = await Promise.all([
    listDepartments(ctx),
    prisma.user.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null }, select: { id: true, name: true, nameAr: true }, orderBy: { name: "asc" } })
  ]);
  const label = (x: { name: string; nameAr: string | null }) => (locale === "ar" && x.nameAr) || x.name;
  const managers = people.map((p) => ({ id: p.id, label: label(p) }));

  return (
    <>
      <PageHeader icon="Network" title={t("departments.title")} subtitle={t("departments.subtitle")} actions={<DepartmentEditor trigger="new" managers={managers} />} />
      <div className="os-card overflow-hidden">
        {depts.length === 0 ? (
          <EmptyState icon="Network" title={t("departments.emptyTitle")} text={t("departments.emptyText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("departments.code")}</th>
                  <th>{t("common.name")}</th>
                  <th>{t("departments.manager")}</th>
                  <th>{t("departments.members")}</th>
                  <th className="w-40" />
                </tr>
              </thead>
              <tbody>
                {depts.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <code className="font-mono text-xs text-os-muted">{d.code}</code>
                    </td>
                    <td className="font-medium">{label(d)}</td>
                    <td className="text-os-muted">{d.manager?.name ?? t("departments.noManager")}</td>
                    <td className="tabular text-os-muted">{d._count.members}</td>
                    <td>
                      <span className="flex justify-end gap-1">
                        <DepartmentEditor trigger="edit" dept={d} managers={managers} />
                        <ArchiveDepartment id={d.id} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
