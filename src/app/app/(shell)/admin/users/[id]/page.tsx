import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { getUser } from "@/server/admin/users";
import { listDepartments, listRoleOptions } from "@/server/admin/org";
import { listAudit } from "@/server/feed";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { PRIVILEGED_ROLE_KEYS } from "@/server/rbac/permissions";
import { Avatar, Badge, fmtDateTime, fmtRelative, PermissionDenied, SectionCard, statusTone } from "@/components/os/ui";
import { UserProfileForm, UserRolesEditor, UserSecurityActions } from "@/components/os/UserForms";

export const metadata = { title: "User" };

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, allowed } = await pageCtx("admin.users.view");
  if (!allowed) return <PermissionDenied permission="admin.users.view" />;
  const locale = await getLocale();
  const t = await getTranslations("os");

  let user;
  try {
    user = await getUser(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const manage = can(ctx, "admin.users.manage");
  const [roles, depts, audit] = await Promise.all([
    listRoleOptions(ctx),
    listDepartments(ctx),
    can(ctx, "admin.audit.view") ? listAudit(ctx, { q: id }) : Promise.resolve(null)
  ]);
  const label = (r: { name: string; nameAr: string | null }) => (locale === "ar" && r.nameAr) || r.name;
  const display = label(user);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/app/admin/users" className="os-btn-ghost size-8 px-0" aria-label={t("common.back")}>
          <span className="rtl:rotate-180">←</span>
        </Link>
        <Avatar name={display} size={44} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{display}</h1>
          <p className="text-sm text-os-muted">
            {user.jobTitle ?? "—"} · <span dir="ltr">{user.email}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={statusTone(user.status)} dot>
            {t(`users.status.${user.status}`)}
          </Badge>
          {user.lockedUntil && user.lockedUntil > new Date() && <Badge tone="danger">{t("users.locked")}</Badge>}
          {user.mustChangePassword && <Badge tone="warning">{t("users.mustChange")}</Badge>}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="grid content-start gap-6">
          <SectionCard title={t("users.profile")}>
            {manage ? (
              <UserProfileForm user={user} departments={depts.map((d) => ({ id: d.id, label: label(d) }))} />
            ) : (
              <dl className="grid gap-3 p-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="os-label">{t("users.department")}</dt>
                  <dd>{depts.find((d) => d.id === user.departmentId)?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="os-label">{t("users.phone")}</dt>
                  <dd dir="ltr">{user.phone ?? "—"}</dd>
                </div>
              </dl>
            )}
          </SectionCard>
          <SectionCard title={t("users.access")}>
            {manage ? (
              <UserRolesEditor
                userId={user.id}
                current={user.roles.map((r) => r.role.id)}
                roles={roles.map((r) => ({ id: r.id, key: r.key, label: label(r), privileged: (PRIVILEGED_ROLE_KEYS as readonly string[]).includes(r.key) && !can(ctx, "admin.roles.grant_privileged") }))}
              />
            ) : (
              <div className="flex flex-wrap gap-1.5 p-4">
                {user.roles.map((r) => (
                  <Badge key={r.role.id}>{label(r.role)}</Badge>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="grid content-start gap-6">
          <SectionCard title={t("users.security")}>
            <dl className="grid grid-cols-2 gap-3 border-b border-os-line p-4 text-sm">
              <div>
                <dt className="os-label">{t("users.lastLogin")}</dt>
                <dd>{user.lastLoginAt ? fmtDateTime(user.lastLoginAt, locale) : t("users.never")}</dd>
              </div>
              <div>
                <dt className="os-label">{t("users.activeSessions")}</dt>
                <dd className="tabular">{user._count.sessions}</dd>
              </div>
              <div>
                <dt className="os-label">{t("common.created")}</dt>
                <dd>{fmtDateTime(user.createdAt, locale)}</dd>
              </div>
            </dl>
            {manage && <UserSecurityActions userId={user.id} status={user.status} self={user.id === ctx.userId} />}
          </SectionCard>

          {audit && (
            <SectionCard title={t("audit.title")} action={<Link href={`/app/admin/audit?q=${user.id}`} className="text-xs text-os-muted hover:text-os-text">{t("common.viewAll")}</Link>}>
              <ol className="divide-y divide-os-line">
                {audit.items.slice(0, 10).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                    <code className="font-mono text-os-text">{a.action}</code>
                    <span className="text-os-faint">
                      {a.actor?.name ?? "—"} · {fmtRelative(a.createdAt, locale)}
                    </span>
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
