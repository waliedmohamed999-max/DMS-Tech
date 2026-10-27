import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { ownedWhere } from "@/server/crm/scope";
import { ownerOptions } from "@/lib/os/crm-page";
import { CONTRACT_TEMPLATE } from "@/lib/commercial/contract-template";
import { PageHeader, PermissionDenied } from "@/components/os/ui";
import { ContractCreator, type NewContractInitial } from "@/components/sales/ContractPanels";

export const metadata = { title: "New contract" };

/** A contract written directly, without a quotation; `?client=` pre-selects the client. */
export default async function NewContractPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { ctx, allowed } = await pageCtx("sales.contracts.create");
  if (!allowed) return <PermissionDenied permission="sales.contracts.create" />;
  const sp = await searchParams;
  const locale = (await getLocale()) as "ar" | "en";
  const t = await getTranslations("os.sales.c");
  const [org, owners] = await Promise.all([prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { currency: true, vatRate: true } }), ownerOptions(ctx, "crm.opportunities.assign", locale)]);
  const client = sp.client
    ? await prisma.client.findFirst({ where: { id: sp.client, organizationId: ctx.organizationId, deletedAt: null, ...(await ownedWhere(ctx)) }, include: { contacts: { where: { isPrimary: true, deletedAt: null }, take: 1, select: { id: true } } } })
    : null;
  const tpl = CONTRACT_TEMPLATE[locale];
  const initial: NewContractInitial = {
    clientId: client?.id ?? "",
    contactId: client?.contacts[0]?.id ?? "",
    opportunityId: "",
    ownerId: ctx.userId,
    language: locale,
    currency: org.currency,
    subtotal: "",
    discountTotal: "",
    vatRate: org.vatRate.toFixed(2).replace(/\.?0+$/, ""),
    title: "",
    startDate: "",
    endDate: "",
    renewalDate: "",
    paymentTerms: tpl.payment,
    scopeOfWork: tpl.scope,
    terms: tpl.terms,
    milestones: []
  };
  return (
    <div className="grid gap-5">
      <PageHeader icon="Handshake" title={t("newTitle")} subtitle={t("newSubtitle")} />
      <ContractCreator initial={initial} owners={owners} templates={CONTRACT_TEMPLATE} />
    </div>
  );
}
