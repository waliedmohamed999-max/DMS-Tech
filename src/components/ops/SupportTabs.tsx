import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/server/db";
import type { Ctx } from "@/server/context";
import { clientTickets, projectTickets, slaState } from "@/server/ops/support";
import { priorityTone, slaTone, ticketTone, userName } from "@/lib/os/ops-page";
import { Badge, EmptyState, fmtDateTime, SectionCard } from "@/components/os/ui";

/** Support tickets of a client (Client 360) or a project — ticket scope always applies on top of the record scope. */
export async function TicketsCard({ ctx, client, project }: { ctx: Ctx; client?: string; project?: string }) {
  const t = await getTranslations("os.ops");
  const locale = await getLocale();
  const rows = client ? await clientTickets(ctx, client) : await projectTickets(ctx, project!);
  if (rows === null) return null;
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.assignedToId).filter(Boolean) as string[])] } }, select: { id: true, name: true, nameAr: true } });
  const open = rows.filter((r) => !["RESOLVED", "CLOSED", "CANCELLED"].includes(r.status));
  return (
    <SectionCard
      title={`${t("support")} · ${t("openN", { n: open.length })}`}
      action={
        <Link href="/app/support?new=1" className="text-xs text-os-muted hover:text-os-text">
          + {t("a.newTicket")}
        </Link>
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon="LifeBuoy" title={t("noTickets")} text={t("scopedTicketsText")} />
      ) : (
        <ul className="divide-y divide-os-line text-sm">
          {rows.map((x) => {
            const sla = slaState(x, "slaPolicy" in x ? (x.slaPolicy as { warnAtPercent: number } | null)?.warnAtPercent : undefined);
            return (
              <li key={x.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <Link href={`/app/support/tickets/${x.id}`} className="min-w-0 flex-1 truncate hover:text-iris-light">
                  <span className="text-[11px] text-os-faint" dir="ltr">{x.number}</span> {x.subject}
                </Link>
                <Badge tone={priorityTone(x.priority)}>{t(`prio.${x.priority}` as "prio.LOW")}</Badge>
                <Badge tone={ticketTone(x.status)}>{t(`tstatus.${x.status}` as "tstatus.NEW")}</Badge>
                {sla.resolution === "breached" || sla.response === "breached" ? <Badge tone={slaTone("breached")}>{t("sla.breached")}</Badge> : null}
                <span className="text-[11px] text-os-faint">{userName(people, x.assignedToId, locale) ?? t("unassigned")} · {fmtDateTime(x.createdAt, locale)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
