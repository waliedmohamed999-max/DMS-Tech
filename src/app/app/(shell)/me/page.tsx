import { getLocale, getTranslations } from "next-intl/server";
import { requireCtx, requireSession } from "@/lib/os/dal";
import { listMySessions } from "@/server/auth/service";
import { prisma } from "@/server/db";
import { revokeSessionAction } from "@/lib/os/actions";
import { Avatar, Badge, fmtRelative, PageHeader, SectionCard } from "@/components/os/ui";
import { ActionButton } from "@/components/os/client";
import { ChangePasswordForm } from "@/components/os/MeForms";

export const metadata = { title: "My profile" };

// Not wrapped by pageCtx: this page must stay reachable while a temporary password is in force.
export default async function MePage({ searchParams }: { searchParams: Promise<{ force?: string }> }) {
  const session = await requireSession();
  const ctx = await requireCtx();
  const { force } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("os");
  const [sessions, roles] = await Promise.all([
    listMySessions(ctx, session.sessionId),
    prisma.role.findMany({ where: { organizationId: ctx.organizationId, key: { in: session.roleKeys } }, select: { key: true, name: true, nameAr: true } })
  ]);
  const name = (locale === "ar" && session.user.nameAr) || session.user.name;
  const forced = session.user.mustChangePassword;

  return (
    <>
      <PageHeader icon="ShieldCheck" title={t("me.title")} subtitle={t("me.subtitle")} />
      {(forced || force) && forced && <p className="mb-6 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">{t("me.mustChange")}</p>}
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="grid content-start gap-6">
          <section className="os-card flex items-center gap-4 p-4">
            <Avatar name={name} size={48} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{name}</p>
              <p className="text-sm text-os-muted" dir="ltr">
                {session.user.email}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {roles.map((r) => (
                  <Badge key={r.key} tone="iris">
                    {(locale === "ar" && r.nameAr) || r.name}
                  </Badge>
                ))}
                <Badge>{t("me.permissions", { n: session.permissions.length })}</Badge>
              </div>
            </div>
          </section>
          <SectionCard title={t("me.password")}>
            <ChangePasswordForm forced={forced} />
          </SectionCard>
        </div>
        <SectionCard title={t("me.sessions")}>
          <ul className="divide-y divide-os-line">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-os-text" dir="ltr">
                    {s.userAgent?.replace(/\(.*?\)/g, "").slice(0, 70) ?? "—"}
                  </p>
                  <p className="text-xs text-os-faint">
                    <span dir="ltr">{s.ip ?? "—"}</span> · {t("me.lastSeen")}: {fmtRelative(s.lastSeenAt, locale)}
                  </p>
                </div>
                {s.current ? (
                  <Badge tone="success">{t("me.thisDevice")}</Badge>
                ) : (
                  !forced && (
                    <ActionButton action={revokeSessionAction.bind(null, s.id)} className="os-btn-ghost h-8 text-xs text-danger">
                      {t("me.revoke")}
                    </ActionButton>
                  )
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
