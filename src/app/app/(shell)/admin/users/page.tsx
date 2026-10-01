import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { listUsers } from "@/server/admin/users";
import { listDepartments, listRoleOptions } from "@/server/admin/org";
import { can } from "@/server/context";
import { PRIVILEGED_ROLE_KEYS } from "@/server/rbac/permissions";
import { Avatar, Badge, EmptyState, flatParams, fmtRelative, PageHeader, Pagination, PermissionDenied, statusTone } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { NewUserButton } from "@/components/os/UserForms";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("admin.users.view");
  if (!allowed) return <PermissionDenied permission="admin.users.view" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os");
  const [data, roles, depts] = await Promise.all([listUsers(ctx, sp), listRoleOptions(ctx), listDepartments(ctx)]);
  const roleLabel = (r: { name: string; nameAr: string | null }) => (locale === "ar" && r.nameAr) || r.name;

  const sortLink = (key: string) => {
    const dir = data.filters.sort === key && data.filters.dir === "asc" ? "desc" : "asc";
    const q = new URLSearchParams(Object.entries({ ...sp, sort: key, dir, page: undefined }).filter((e): e is [string, string] => Boolean(e[1])));
    return `/app/admin/users?${q}`;
  };
  const arrow = (key: string) => (data.filters.sort === key ? (data.filters.dir === "asc" ? " ↑" : " ↓") : "");

  return (
    <>
      <PageHeader
        icon="Users"
        title={t("users.title")}
        subtitle={t("users.subtitle")}
        actions={
          can(ctx, "admin.users.manage") ? (
            <NewUserButton
              roles={roles.map((r) => ({ id: r.id, key: r.key, label: roleLabel(r), privileged: (PRIVILEGED_ROLE_KEYS as readonly string[]).includes(r.key) && !can(ctx, "admin.roles.grant_privileged") }))}
              departments={depts.map((d) => ({ id: d.id, label: roleLabel(d) }))}
            />
          ) : null
        }
      />
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t("users.searchPh") }}
          selects={[
            { name: "status", allLabel: t("users.anyStatus"), options: (["ACTIVE", "INVITED", "DISABLED"] as const).map((s) => ({ value: s, label: t(`users.status.${s}`) })) },
            { name: "role", allLabel: t("users.anyRole"), options: roles.map((r) => ({ value: r.key, label: roleLabel(r) })) }
          ]}
        />
        {data.items.length === 0 ? (
          <EmptyState icon="Users" title={t("users.emptyTitle")} text={t("users.emptyText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>
                    <Link href={sortLink("name")} className="hover:text-os-text">
                      {t("common.name")}
                      {arrow("name")}
                    </Link>
                  </th>
                  <th className="hidden md:table-cell">{t("users.department")}</th>
                  <th>{t("users.roles")}</th>
                  <th>{t("common.status")}</th>
                  <th className="hidden lg:table-cell">
                    <Link href={sortLink("lastLoginAt")} className="hover:text-os-text">
                      {t("users.lastLogin")}
                      {arrow("lastLoginAt")}
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => {
                  const display = (locale === "ar" && u.nameAr) || u.name;
                  const locked = u.lockedUntil && u.lockedUntil > new Date();
                  return (
                    <tr key={u.id}>
                      <td>
                        <Link href={`/app/admin/users/${u.id}`} className="flex items-center gap-3">
                          <Avatar name={display} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-os-text hover:text-iris-light">{display}</span>
                            <span className="block truncate text-xs text-os-faint" dir="ltr">
                              {u.email}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="hidden text-os-muted md:table-cell">{u.department ? roleLabel(u.department) : "—"}</td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <Badge key={r.role.key} tone={(PRIVILEGED_ROLE_KEYS as readonly string[]).includes(r.role.key) ? "gold" : "neutral"}>
                              {roleLabel(r.role)}
                            </Badge>
                          ))}
                        </span>
                      </td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          <Badge tone={statusTone(u.status)} dot>
                            {t(`users.status.${u.status}`)}
                          </Badge>
                          {locked && <Badge tone="danger">{t("users.locked")}</Badge>}
                        </span>
                      </td>
                      <td className="hidden text-xs text-os-muted lg:table-cell">{u.lastLoginAt ? fmtRelative(u.lastLoginAt, locale) : t("users.never")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/admin/users" params={sp} />
      </div>
    </>
  );
}
