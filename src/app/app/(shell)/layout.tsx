import { getLocale } from "next-intl/server";
import { requireSession } from "@/lib/os/dal";
import { CREATE_ITEMS, findModule, NAV } from "@/lib/os/modules";
import { unreadCount } from "@/server/feed";
import { toCtx } from "@/lib/os/dal";
import { isPermission, type Permission } from "@/server/rbac/permissions";
import Shell, { type ShellNavGroup } from "@/components/os/Shell";
import { prisma } from "@/server/db";
import { novaStatus } from "@/server/integrations/nova";

/** Authenticated shell: sidebar + topbar. Navigation is filtered by the user's permissions. */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const locale = (await getLocale()) as "ar" | "en";
  const perms = new Set<Permission>(session.permissions.filter(isPermission));
  const allowed = (p?: Permission) => !p || perms.has(p);

  const groups: ShellNavGroup[] = NAV.map((g) => ({
    key: g.key,
    label: g.label[locale],
    items: g.items
      .filter((it) => allowed(it.permission))
      .map((it) => ({ key: it.key, href: it.href, icon: it.icon, label: it.label[locale], about: it.about[locale], live: it.live, phase: it.phase }))
  })).filter((g) => g.items.length);

  const createItems = CREATE_ITEMS.filter((c) => {
    const mod = findModule(c.module);
    return mod && allowed(c.permission ?? mod.permission);
  }).map((c) => {
    const mod = findModule(c.module)!;
    return { key: c.key, icon: c.icon, label: c.label[locale], href: mod.live ? c.href : undefined, phase: mod.phase };
  });

  const role = await prisma.role.findFirst({ where: { organizationId: session.user.organizationId, key: { in: session.roleKeys } }, orderBy: { isSystem: "desc" }, select: { name: true, nameAr: true } });

  return (
    <Shell
      groups={groups}
      createItems={createItems}
      unread={await unreadCount(toCtx(session))}
      nova={perms.has("nova.use") ? { configured: novaStatus().configured } : null}
      user={{ name: (locale === "ar" && session.user.nameAr) || session.user.name, email: session.user.email, role: (locale === "ar" ? role?.nameAr : role?.name) ?? "" }}
    >
      {children}
    </Shell>
  );
}
