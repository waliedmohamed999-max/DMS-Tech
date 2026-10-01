import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { ownedWhere } from "@/server/crm/scope";
import { builderData, blankInitial, itemFromService } from "@/lib/os/sales-page";
import { PageHeader, PermissionDenied } from "@/components/os/ui";
import QuoteBuilder from "@/components/sales/QuoteBuilder";

export const metadata = { title: "New quotation" };

/** Builder for a new quotation; `?opportunity=` or `?client=` pre-fill the commercial context. */
export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ opportunity?: string; client?: string }> }) {
  const { ctx, allowed } = await pageCtx("sales.quotations.create");
  if (!allowed) return <PermissionDenied permission="sales.quotations.create" />;
  const sp = await searchParams;
  const locale = (await getLocale()) as "ar" | "en";
  const t = await getTranslations("os.sales.q");
  const data = await builderData(ctx, locale);
  const initial = blankInitial(data.org, ctx.userId, locale);
  let lockedClient = false;

  if (sp.opportunity) {
    const o = await prisma.opportunity.findFirst({
      where: { id: sp.opportunity, organizationId: ctx.organizationId, ...(await ownedWhere(ctx)) },
      include: { client: { select: { id: true, displayName: true } } }
    });
    if (o) {
      Object.assign(initial, { clientId: o.clientId, clientLabel: o.client.displayName, contactId: o.primaryContactId ?? "", opportunityId: o.id, ownerId: o.ownerId ?? ctx.userId, currency: o.currency });
      // the opportunity's service becomes the first line at CATALOG price — its estimated value is not a price
      const svc = data.services.find((s) => s.id === o.serviceId);
      if (svc) initial.items = [itemFromService(svc, locale)];
      lockedClient = true;
    }
  } else if (sp.client) {
    const c = await prisma.client.findFirst({ where: { id: sp.client, organizationId: ctx.organizationId, deletedAt: null }, include: { contacts: { where: { isPrimary: true, deletedAt: null }, take: 1 } } });
    if (c) {
      Object.assign(initial, { clientId: c.id, clientLabel: c.displayName, contactId: c.contacts[0]?.id ?? "" });
      lockedClient = true;
    }
  }

  return (
    <>
      <PageHeader icon="FileText" title={t("newTitle")} subtitle={t("newSubtitle")} />
      <QuoteBuilder quotationId={null} initial={initial} services={data.services} packages={data.packages} owners={data.owners} settings={data.settings} lockedClient={lockedClient} />
    </>
  );
}
