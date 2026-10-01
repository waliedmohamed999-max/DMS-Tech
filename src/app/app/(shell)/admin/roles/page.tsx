import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { listRoles } from "@/server/admin/org";
import { can } from "@/server/context";
import { PERMISSIONS, PRIVILEGED_ROLE_KEYS } from "@/server/rbac/permissions";
import { Badge, PageHeader, PermissionDenied } from "@/components/os/ui";
import { NewRoleButton, RoleMatrix } from "@/components/os/AdminForms";

export const metadata = { title: "Roles & permissions" };

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { ctx, allowed } = await pageCtx("admin.roles.view");
  if (!allowed) return <PermissionDenied permission="admin.roles.view" />;
  const { role: roleParam } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("os.roles");
  const roles = await listRoles(ctx);
  const active = roles.find((r) => r.id === roleParam) ?? roles[0];
  const catalog = Object.entries(PERMISSIONS).map(([key, v]) => ({ key, group: v.group, phase: v.phase }));
  const groupLabels = Object.fromEntries(["command", "admin", "crm", "sales", "delivery", "finance", "people", "marketing", "operations", "nova"].map((g) => [g, t(`groups.${g}` as "groups.admin")]));
  const label = (r: { name: string; nameAr: string | null }) => (locale === "ar" && r.nameAr) || r.name;
  const isPriv = (k: string) => (PRIVILEGED_ROLE_KEYS as readonly string[]).includes(k);
  const editable = can(ctx, "admin.roles.manage") && active.key !== "super_admin" && (!isPriv(active.key) || can(ctx, "admin.roles.grant_privileged"));

  return (
    <>
      <PageHeader icon="ShieldCheck" title={t("title")} subtitle={t("subtitle")} actions={can(ctx, "admin.roles.manage") ? <NewRoleButton /> : null} />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <nav className="os-card h-fit overflow-hidden">
          <ul className="divide-y divide-os-line">
            {roles.map((r) => (
              <li key={r.id}>
                <a href={`/app/admin/roles?role=${r.id}`} className={`flex items-center justify-between gap-2 px-4 py-3 text-sm transition ${r.id === active.id ? "bg-os-raised" : "hover:bg-os-raised/60"}`}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{label(r)}</span>
                    <span className="block text-xs text-os-faint">
                      {r.isSystem ? t("system") : t("custom")} · {t("users", { n: r._count.users })}
                    </span>
                  </span>
                  {isPriv(r.key) && <Badge tone="gold">★</Badge>}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <section className="os-card overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-os-line px-4 py-3">
            <div>
              <h2 className="font-semibold">{label(active)}</h2>
              <p className="text-xs text-os-faint">
                <code className="font-mono">{active.key}</code> · {active.permissions.length}/{catalog.length}
              </p>
            </div>
            {active.key === "super_admin" && <Badge tone="gold">{t("immutable")}</Badge>}
          </header>
          <p className="border-b border-os-line px-4 py-2 text-xs text-os-faint">{t("phaseNote")}</p>
          <RoleMatrix key={active.id} roleId={active.id} permissions={active.permissions} catalog={catalog} held={[...ctx.permissions]} editable={editable} groupLabels={groupLabels} />
        </section>
      </div>
    </>
  );
}
