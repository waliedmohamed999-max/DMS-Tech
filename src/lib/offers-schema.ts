import { site } from "@/content/site";

type CatalogTier = { key: string; name: string; amount: number | null; from: boolean; billing: "one-time" | "monthly" | "term"; termMonths?: number };
type CatalogGroup = { title: string; draft: boolean; tiers: CatalogTier[] };

/**
 * Structured data for /offers: the published packages as an offer catalogue (SAR, before VAT). A "from" price is a
 * minimum, a monthly plan is priced per month and a term plan for its whole term; drafts and unpriced tiers are left out.
 */
export function offerCatalog(groups: CatalogGroup[], locale: string, name: string) {
  const base = site.url.replace(/\/$/, "");
  const prefix = locale === "ar" ? "" : `/${locale}`;
  return {
    "@context": "https://schema.org",
    "@type": "OfferCatalog",
    name,
    url: `${base}${prefix}/offers`,
    itemListElement: groups
      .filter((g) => !g.draft)
      .map((g) => ({
        "@type": "OfferCatalog",
        name: g.title,
        itemListElement: g.tiers
          .filter((t) => t.amount !== null)
          .map((t) => ({
            "@type": "Offer",
            name: `${g.title} — ${t.name}`,
            url: `${base}${prefix}/offers/${t.key}`,
            priceSpecification: {
              "@type": t.billing === "one-time" ? "PriceSpecification" : "UnitPriceSpecification",
              ...(t.from ? { minPrice: t.amount } : { price: t.amount }),
              priceCurrency: "SAR",
              valueAddedTaxIncluded: false,
              ...(t.billing === "monthly" ? { referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" } } : {}),
              ...(t.billing === "term" && t.termMonths ? { billingDuration: { "@type": "QuantitativeValue", value: t.termMonths, unitCode: "MON" } } : {})
            },
            seller: { "@type": "Organization", name: site.name }
          }))
      }))
  };
}
