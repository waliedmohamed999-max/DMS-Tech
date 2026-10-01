import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { getQuotation } from "@/server/commercial/quotations";
import { isAppError } from "@/server/errors";
import { ymd } from "@/server/commercial/dates";
import { builderData, itemKey } from "@/lib/os/sales-page";
import { PageHeader, PermissionDenied } from "@/components/os/ui";
import QuoteBuilder from "@/components/sales/QuoteBuilder";

export const metadata = { title: "Edit quotation" };

/** Only the current DRAFT version is editable; anything else goes back to the record (server enforces too). */
export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, allowed } = await pageCtx("sales.quotations.edit");
  if (!allowed) return <PermissionDenied permission="sales.quotations.edit" />;
  const locale = (await getLocale()) as "ar" | "en";
  const t = await getTranslations("os.sales.q");
  let d;
  try {
    d = await getQuotation(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { quotation: q, version: v } = d;
  if (v.status !== "DRAFT") redirect(`/app/sales/quotations/${id}`);
  const data = await builderData(ctx, locale);
  return (
    <>
      <PageHeader
        icon="FileText"
        title={`${q.number} V${v.versionNumber}`}
        subtitle={t("editSubtitle")}
        actions={
          <Link href={`/app/sales/quotations/${id}`} className="os-btn-ghost">
            {t("backToQuote")}
          </Link>
        }
      />
      <QuoteBuilder
        quotationId={q.id}
        lockedClient
        services={data.services}
        packages={data.packages}
        owners={data.owners}
        settings={data.settings}
        initial={{
          clientId: q.clientId,
          clientLabel: q.client.displayName,
          contactId: q.contactId ?? "",
          opportunityId: q.opportunityId ?? "",
          ownerId: q.ownerId ?? ctx.userId,
          language: v.language,
          currency: v.currency,
          issueDate: ymd(v.issueDate)!,
          validUntil: ymd(v.validUntil)!,
          paymentTerms: v.paymentTerms ?? "",
          deliveryTerms: v.deliveryTerms ?? "",
          termsAndConditions: v.termsAndConditions ?? "",
          notes: v.notes ?? "",
          clientMessage: v.clientMessage ?? "",
          items: v.items.map((i) => ({
            key: itemKey(),
            serviceId: i.serviceId,
            packageId: i.packageId,
            name: i.name,
            description: i.description ?? "",
            unit: i.unit ?? "",
            // "10.000" → "10", "1.500" → "1.5" (toFixed first: Decimal("10").toString() has no fraction)
            quantity: i.quantity.toFixed(3).replace(/\.?0+$/, ""),
            unitPrice: i.unitPrice.toFixed(2),
            discountType: i.discountType,
            discountValue: i.discountValue.toFixed(2),
            taxBehavior: i.taxBehavior
          }))
        }}
      />
    </>
  );
}
