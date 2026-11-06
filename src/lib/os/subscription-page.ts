import "server-only";
import { publishedCatalog } from "@/server/website/catalog";
import type { PlanPreset } from "@/components/subscriptions/SubscriptionForm";

/**
 * Website packages that can be subscribed to, from the published /offers catalog: monthly plans (with their yearly
 * price) and term plans (the price covers the term). One-time projects are left out. The minimum term is read from
 * the package's own wording ("الحد الأدنى 3 أشهر" / "بحد أدنى 3 أشهر"), never assumed.
 */
export async function planPresets(locale: "ar" | "en"): Promise<PlanPreset[]> {
  const cat = await publishedCatalog();
  const minimum = (...texts: (string | undefined)[]) => {
    for (const x of texts) {
      const m = x && /(?:الحد الأدنى|بحد أدنى)\s*(\d+)\s*أشهر/.exec(x);
      if (m) return Number(m[1]);
    }
    return 0;
  };
  const out: PlanPreset[] = [];
  for (const g of cat.groups) {
    if (g.draft) continue;
    for (const tier of g.tiers) {
      if (tier.price == null || tier.from) continue;
      if (tier.billing === "monthly") {
        out.push({ key: tier.key, group: g.short[locale] || g.title[locale], name: tier.name[locale], price: tier.price, interval: "MONTHLY", annual: tier.annual ?? null, commitment: minimum(tier.after.ar, g.notice.ar) });
      } else if (tier.billing === "term" && tier.termMonths && [3, 6, 12].includes(tier.termMonths)) {
        const interval = tier.termMonths === 3 ? "QUARTERLY" : tier.termMonths === 6 ? "SEMIANNUAL" : "ANNUAL";
        out.push({ key: tier.key, group: g.short[locale] || g.title[locale], name: tier.name[locale], price: tier.price, interval, annual: null, commitment: tier.termMonths });
      }
    }
  }
  return out;
}
