import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { captureWebsiteLead, websiteLeadSchema } from "@/server/crm/website";
import { buildLeadMail } from "@/server/notify/lead-mail";
import { activeOffers, findDeal, offerLabel, packageGroups } from "@/content/offers";
import { resetDb, setupOrg } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await setupOrg();
});
afterEach(() => vi.unstubAllEnvs());

const lead = (over: Record<string, unknown> = {}) => ({ name: "سارة", phone: "0550000003", service: "web-development", message: "نحتاج موقع", source: "offer", locale: "ar", elapsed: 5000, ...over });

describe("packages & offers", () => {
  it("1. every package has a unique key and no price is set without approval (null until the company sets one)", () => {
    const keys = packageGroups.flatMap((g) => g.tiers.map((t) => t.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(packageGroups.flatMap((g) => g.tiers).every((t) => t.price === null || t.price > 0)).toBe(true);
    expect(offerLabel("pkg:web-growth")).toBe("باقات المواقع والتطبيقات — الاحترافية");
    expect(offerLabel("pkg:nope")).toBeNull();
    expect(offerLabel("anything")).toBeNull();
  });

  it("2. design examples never appear in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(activeOffers().some((o) => o.preview)).toBe(false);
    expect(findDeal("example-k3v9q2")).toBeNull();
    expect(offerLabel("offer:store-launch-example")).toBeNull();
  });

  it("3. a request from a package page reaches the CRM with the package (resolved on the server, never from the visitor)", async () => {
    vi.stubEnv("OS_ORG_SLUG", "test-org");
    await captureWebsiteLead(lead({ offer: "pkg:store-growth" }));
    const l = await prisma.lead.findFirstOrThrow();
    expect(l.message).toBe("[باقات المتاجر الإلكترونية — النمو]\nنحتاج موقع");
    await captureWebsiteLead(lead({ phone: "0550000004", offer: "pkg:made-up<script>" }));
    const l2 = await prisma.lead.findFirstOrThrow({ where: { phone: "0550000004" } });
    expect(l2.message).toBe("نحتاج موقع");
  });

  it("4. the e-mail to the company names the package", () => {
    const m = buildLeadMail(websiteLeadSchema.parse(lead({ offer: "pkg:wa-pro" })), { saved: true });
    expect(m.text).toContain("الباقة / العرض: باقات حلول واتساب — الاحترافية");
    expect(m.text).toContain("النموذج: الباقات والعروض");
  });
});
