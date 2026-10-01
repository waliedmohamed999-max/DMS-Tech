import "server-only";
import { prisma } from "@/server/db";
import { can, type Ctx } from "@/server/context";
import { listPackages, serviceChoices } from "@/server/commercial/catalog";
import { addDays, todayIn, ymd } from "@/server/commercial/dates";
import { ownerOptions } from "./crm-page";
import type { BuilderInitial, BuilderItem, CatalogPackage, CatalogService } from "@/components/sales/QuoteBuilder";

/** Everything the quotation builder needs from the server (catalog, owners, approval settings). */
export async function builderData(ctx: Ctx, locale: string) {
  const [org, services, packages, owners] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } }),
    can(ctx, "services.view") ? serviceChoices(ctx) : Promise.resolve([]),
    can(ctx, "services.view") ? listPackages(ctx) : Promise.resolve([]),
    ownerOptions(ctx, "crm.opportunities.assign", locale)
  ]);
  return {
    org,
    services: services as CatalogService[],
    packages: packages.map(
      (p): CatalogPackage => ({
        id: p.id,
        code: p.code,
        nameAr: p.nameAr,
        nameEn: p.nameEn,
        descriptionAr: p.descriptionAr,
        descriptionEn: p.descriptionEn,
        defaultPrice: p.defaultPrice.toFixed(2),
        taxBehavior: p.taxBehavior,
        items: p.items.map((i) => ({ nameAr: i.service.nameAr, nameEn: i.service.nameEn, quantity: i.quantity.toString(), optional: i.optional }))
      })
    ),
    owners,
    settings: {
      vatRate: org.vatRate.toFixed(2),
      currency: org.currency,
      quoteApprovalThreshold: org.quoteApprovalThreshold.toFixed(2),
      discountApprovalPercent: org.discountApprovalPercent.toFixed(2),
      quoteExecutiveApprovalThreshold: org.quoteExecutiveApprovalThreshold?.toFixed(2) ?? null,
      customPricingRule: org.quoteCustomPricingRequiresApproval
    }
  };
}

let seq = 0;
export const itemKey = () => `srv-${seq++}`;

export function blankInitial(org: { timezone: string; currency: string; quoteValidityDays: number }, ownerId: string, language: "ar" | "en"): BuilderInitial {
  const today = todayIn(org.timezone);
  return {
    clientId: "",
    contactId: "",
    opportunityId: "",
    ownerId,
    language,
    currency: org.currency,
    issueDate: ymd(today)!,
    validUntil: ymd(addDays(today, org.quoteValidityDays))!,
    paymentTerms: "",
    deliveryTerms: "",
    termsAndConditions: "",
    notes: "",
    clientMessage: "",
    items: []
  };
}

/** Item row for the builder from a catalog service (catalog price, never the opportunity estimate). */
export function itemFromService(s: CatalogService, language: "ar" | "en"): BuilderItem {
  return {
    key: itemKey(),
    serviceId: s.id,
    name: language === "ar" ? s.nameAr : s.nameEn,
    description: (language === "ar" ? s.quotationDescriptionAr : s.quotationDescriptionEn) ?? "",
    unit: "",
    quantity: "1",
    unitPrice: s.basePrice ?? "0",
    discountType: "NONE",
    discountValue: "0",
    taxBehavior: (s.taxBehavior as BuilderItem["taxBehavior"]) ?? "STANDARD"
  };
}
