import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { ownedWhere } from "@/server/crm/scope";
import { PageHeader, PermissionDenied } from "@/components/os/ui";
import { CreateProjectForm } from "@/components/projects/QuickCreate";

export const metadata = { title: "New project" };

/** `?contract=` / `?quotation=` pre-select the commercial source. Sources already delivering are excluded. */
export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ contract?: string; quotation?: string }> }) {
  const { ctx, allowed } = await pageCtx("projects.create");
  if (!allowed) return <PermissionDenied permission="projects.create" />;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("os.projects");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
  const scope = await ownedWhere(ctx);
  const contracts = can(ctx, "sales.contracts.view")
    ? await prisma.contract.findMany({
        where: { organizationId: ctx.organizationId, status: { in: ["ACTIVE", "EXPIRING"] }, projects: { none: { status: { not: "CANCELLED" } } }, ...scope },
        orderBy: { updatedAt: "desc" },
        take: 100,
        include: { client: { select: { displayName: true } }, quotationVersion: { include: { items: { select: { serviceId: true }, take: 1, where: { serviceId: { not: null } } } } }, opportunity: { select: { serviceId: true } } }
      })
    : [];
  const quotations =
    org.projectFromQuotationAllowed && can(ctx, "sales.quotations.view")
      ? await prisma.quotation.findMany({
          where: { organizationId: ctx.organizationId, status: "ACCEPTED", projects: { none: { status: { not: "CANCELLED" } } }, contracts: { none: { status: { not: "CANCELLED" } } }, ...scope },
          orderBy: { updatedAt: "desc" },
          take: 100,
          include: { client: { select: { displayName: true } }, opportunity: { select: { serviceId: true } } }
        })
      : null;
  const templates = await prisma.projectTemplate.findMany({ where: { organizationId: ctx.organizationId, active: true }, orderBy: { nameEn: "asc" } });
  const people = can(ctx, "projects.manage_team") ? (await prisma.user.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true } })).map((u) => ({ id: u.id, label: (locale === "ar" && u.nameAr) || u.name })) : null;
  const initial = sp.contract ? { source: "contract" as const, id: sp.contract } : sp.quotation && quotations ? { source: "quotation" as const, id: sp.quotation } : { source: contracts.length || !org.internalProjectsAllowed ? ("contract" as const) : ("internal" as const), id: "" };
  return (
    <>
      <PageHeader icon="Layers" title={t("newProject")} subtitle={t("newSubtitle")} />
      <CreateProjectForm
        me={ctx.userId}
        initial={initial}
        internalAllowed={org.internalProjectsAllowed}
        people={people}
        templates={templates.map((x) => ({ id: x.id, label: locale === "ar" ? x.nameAr : x.nameEn, serviceId: x.serviceId }))}
        contracts={contracts.map((c) => ({ id: c.id, label: `${c.number} · ${c.client.displayName} — ${c.title}`, serviceId: c.quotationVersion?.items[0]?.serviceId ?? c.opportunity?.serviceId ?? null }))}
        quotations={quotations?.map((q) => ({ id: q.id, label: `${q.number} · ${q.client.displayName}`, serviceId: q.opportunity?.serviceId ?? null })) ?? null}
      />
    </>
  );
}
