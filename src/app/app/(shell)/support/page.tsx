import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can, canAny } from "@/server/context";
import { listTickets, supportAgents } from "@/server/ops/support";
import { sweepOpsIfDue } from "@/server/ops/sweep";
import { opsOptions, priorityTone, slaTone, ticketTone, userName } from "@/lib/os/ops-page";
import { createTicketAction } from "@/lib/os/ops-actions";
import { Badge, EmptyState, flatParams, fmtDateTime, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { ActionForm } from "@/components/hr/Forms";

export const metadata = { title: "Support" };
const STAFF_VIEWS = ["mine", "unassigned", "open", "urgent", "waiting", "overdue", "resolved", "created"] as const;

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await pageCtx();
  if (!canAny(ctx, "support.tickets.view", "support.tickets.create", "support.tickets.manage")) return <PermissionDenied permission="support.tickets.view" />;
  await sweepOpsIfDue(ctx.organizationId); // SLA warnings / breaches are evaluated server-side (throttled, leased)
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.ops");
  const data = await listTickets(ctx, sp);
  const staff = data.staff;
  const [opts, agents, services] = await Promise.all([
    opsOptions(ctx, locale, { clients: staff, projects: staff }),
    can(ctx, "support.tickets.assign") || can(ctx, "support.tickets.manage") ? supportAgents(ctx) : Promise.resolve([]),
    staff ? prisma.service.findMany({ where: { organizationId: ctx.organizationId, active: true }, orderBy: { nameEn: "asc" }, select: { id: true, nameAr: true, nameEn: true } }) : Promise.resolve([])
  ]);
  const views = staff ? STAFF_VIEWS : (["created"] as const);
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="LifeBuoy"
        title={t("support")}
        subtitle={staff ? t("supportSubtitle") : t("supportSubtitleRequester")}
        actions={
          can(ctx, "support.tickets.create") ? (
            <ActionForm
              action={createTicketAction}
              trigger={`+ ${t("a.newTicket")}`}
              submitLabel={t("a.create")}
              redirect="/app/support/tickets/:id"
              autoOpen={sp.new === "1"}
              onCloseHref="/app/support"
              note={t("newTicketNote")}
              fields={[
                { name: "subject", label: t("f.subject"), required: true, span: true },
                { name: "description", label: t("f.description"), type: "textarea", required: true },
                { name: "category", label: t("f.category"), type: "select", required: true, value: "TECHNICAL", options: ["TECHNICAL", "BUG", "ACCESS", "CHANGE_REQUEST", "BILLING", "QUESTION", "OTHER"].map((c) => ({ value: c, label: t(`tcat.${c}` as "tcat.TECHNICAL") })) },
                { name: "priority", label: t("f.priority"), type: "select", required: true, value: "MEDIUM", options: ["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => ({ value: p, label: t(`prio.${p}` as "prio.LOW") })) },
                ...(staff
                  ? [
                      { name: "source", label: t("f.source"), type: "select" as const, required: true, value: "CLIENT_RECORDED", options: ["INTERNAL", "CLIENT_RECORDED", "PHONE", "OTHER"].map((s) => ({ value: s, label: t(`tsrc.${s}` as "tsrc.INTERNAL") })) },
                      { name: "clientId", label: t("f.client"), type: "select" as const, options: opts.clients },
                      { name: "projectId", label: t("f.project"), type: "select" as const, options: opts.projects },
                      { name: "serviceId", label: t("f.service"), type: "select" as const, options: services.map((s) => ({ value: s.id, label: locale === "ar" ? s.nameAr : s.nameEn })) },
                      ...(agents.length ? [{ name: "assignedToId", label: t("f.assignee"), type: "select" as const, options: agents.map((a) => ({ value: a.id, label: (locale === "ar" && a.nameAr) || a.name })) }] : []),
                      { name: "tags", label: t("f.tags"), hint: t("tagsHint") }
                    ]
                  : [])
              ]}
            />
          ) : undefined
        }
      />
      {views.length > 1 && (
        <nav className="no-scrollbar flex gap-1 overflow-x-auto">
          {views.map((v) => (
            <Link key={v} href={`?view=${v}`} className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${data.view === v ? "border-iris bg-iris/10 text-os-text" : "border-os-line text-os-muted hover:text-os-text"} ${v === "overdue" && data.counts.overdue ? "text-danger" : ""}`}>
              {t(`tview.${v}` as "tview.mine")} <b className="tabular">{data.counts[v] ?? 0}</b>
            </Link>
          ))}
        </nav>
      )}
      <div className="os-card overflow-hidden">
        <FilterBar search={{ placeholder: t("searchTickets") }} />
        {data.items.length === 0 ? (
          <EmptyState icon="LifeBuoy" title={t("noTickets")} text={t("noTicketsText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.ticket")}</th>
                  <th className="hidden md:table-cell">{t("f.client")}</th>
                  <th>{t("f.priority")}</th>
                  <th>{t("f.status")}</th>
                  {staff && <th className="hidden lg:table-cell">{t("f.assignee")}</th>}
                  {staff && <th>SLA</th>}
                </tr>
              </thead>
              <tbody>
                {data.items.map((x) => (
                  <tr key={x.id}>
                    <td className="min-w-[200px]">
                      <Link href={`/app/support/tickets/${x.id}`} className="font-medium hover:text-iris-light">
                        {x.subject}
                      </Link>
                      <span className="block text-[11px] text-os-faint">
                        <span dir="ltr">{x.number}</span> · {fmtDateTime(x.createdAt, locale)}
                      </span>
                    </td>
                    <td className="hidden text-xs text-os-muted md:table-cell">{x.client ? (locale === "ar" && x.client.nameAr) || x.client.displayName : "—"}</td>
                    <td>
                      <Badge tone={priorityTone(x.priority)}>{t(`prio.${x.priority}` as "prio.LOW")}</Badge>
                    </td>
                    <td>
                      <Badge tone={ticketTone(x.status)}>{t(`tstatus.${x.status}` as "tstatus.NEW")}</Badge>
                    </td>
                    {staff && <td className="hidden text-xs lg:table-cell">{userName(data.people, x.assignedToId, locale) ?? <span className="text-warning">{t("unassigned")}</span>}</td>}
                    {staff && (
                      <td>
                        {x.sla.resolution !== "none" ? <Badge tone={slaTone(x.sla.response === "breached" ? "breached" : x.sla.resolution)}>{t(`sla.${x.sla.response === "breached" ? "breached" : x.sla.resolution}` as "sla.ok")}</Badge> : <span className="text-[11px] text-os-faint">—</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/support" params={{ ...sp, view: data.view }} />
      </div>
    </div>
  );
}
