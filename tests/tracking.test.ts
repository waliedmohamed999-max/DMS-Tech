import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { ATTRIBUTION_KEY_RE, captureWebsiteLead, websiteLeadSchema } from "@/server/crm/website";
import { ATTRIBUTION_PARAMS, readAttribution } from "@/components/layout/AttributionCapture";
import { isWhatsAppUrl, listenWhatsAppClicks, newEventId, priceValue, track, whatsappClickParams } from "@/lib/track";
import { resetDb, setupOrg } from "./helpers";

vi.mock("server-only", () => ({}));

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const lead = (over: Record<string, unknown> = {}) => ({ name: "سارة", phone: "0550000003", service: "web-development", message: "نحتاج موقع", source: "offer", locale: "ar", elapsed: 5000, ...over });

/** a minimal browser: window.dataLayer + location, enough for track() */
function fakeWindow(pathname = "/offers") {
  const w = { dataLayer: [] as Record<string, unknown>[], location: { pathname } };
  vi.stubGlobal("window", w);
  return w;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("attribution parameters", () => {
  it("1. reads gbraid, wbraid and li_fat_id besides utm_* / gclid / fbclid / ttclid / ScCid", () => {
    const a = readAttribution("?utm_source=google&gbraid=GB1&wbraid=WB1&li_fat_id=LI-1&gclid=G1&fbclid=F1&ttclid=T1&ScCid=S1&session=x");
    expect(a).toEqual({ utm_source: "google", gclid: "G1", gbraid: "GB1", wbraid: "WB1", fbclid: "F1", ttclid: "T1", sccid: "S1", li_fat_id: "LI-1" });
  });

  it("2. every browser key is accepted by the server whitelist, and nothing else", () => {
    for (const k of ATTRIBUTION_PARAMS) expect(ATTRIBUTION_KEY_RE.test(k)).toBe(true);
    for (const k of ["session_id", "utm_id", "gclid2", "li_fat", "msclkid"]) expect(ATTRIBUTION_KEY_RE.test(k)).toBe(false);
    expect(websiteLeadSchema.safeParse(lead({ utm: { gbraid: "a", wbraid: "b", li_fat_id: "c" } })).success).toBe(true);
    expect(websiteLeadSchema.safeParse(lead({ utm: { msclkid: "x" } })).success).toBe(false);
  });
});

describe("event helpers", () => {
  it("3. priceValue reads displayed SAR prices and returns undefined when there is none", () => {
    expect(priceValue("2,799")).toBe(2799);
    expect(priceValue("SAR 3,899")).toBe(3899);
    expect(priceValue("١٠٬٩٩٩ ر.س")).toBe(10999);
    expect(priceValue(21999)).toBe(21999);
    expect(priceValue(null)).toBeUndefined();
    expect(priceValue("")).toBeUndefined();
    expect(priceValue("على الطلب")).toBeUndefined();
  });

  it("4. newEventId returns distinct UUID v4 values", () => {
    const a = newEventId();
    expect(a).toMatch(uuidRe);
    expect(newEventId()).not.toBe(a);
  });

  it("5. track drops empty parameters and keeps a once-key to one event", () => {
    const w = fakeWindow();
    track("generate_lead", { form: "offer", offer: undefined, value: 2799, currency: "SAR", event_id: "e1" }, "lead:once");
    track("generate_lead", { form: "offer" }, "lead:once");
    expect(w.dataLayer).toEqual([{ event: "generate_lead", form: "offer", value: 2799, currency: "SAR", event_id: "e1" }]);
  });
});

describe("WhatsApp clicks", () => {
  it("6. recognises WhatsApp chat links only", () => {
    for (const h of ["https://wa.me/966500000000", "https://wa.me/?text=hi", "https://api.whatsapp.com/send?phone=966", "whatsapp://send?text=x"]) expect(isWhatsAppUrl(h)).toBe(true);
    for (const h of ["https://dmstech.sa/whatsapp", "/offers/whatsapp", "https://wa.me.evil.test/1", "https://www.whatsapp.com/business", "mailto:a@b.c", null]) expect(isWhatsAppUrl(h)).toBe(false);
  });

  it("7. builds click_cta parameters with channel, cta and offer key", () => {
    expect(whatsappClickParams({ href: "https://wa.me/966", cta: "offers_hero_whatsapp" }, "/offers")).toEqual({ cta: "offers_hero_whatsapp", channel: "whatsapp", offer: undefined, page: "/offers" });
    expect(whatsappClickParams({ href: "https://wa.me/966", offer: "pkg:store-growth" }, "/offers/x")).toMatchObject({ cta: "whatsapp_link", offer: "pkg:store-growth" });
    expect(whatsappClickParams({ href: "https://wa.me/966", inFooter: true }, "/")).toMatchObject({ cta: "footer_whatsapp" });
    expect(whatsappClickParams({ href: "/quote", cta: "x" }, "/")).toBeNull();
  });

  it("8. the delegated listener fires click_cta for WhatsApp anchors only, and stops after cleanup", () => {
    const w = fakeWindow("/offers/store-growth");
    const handlers: Record<string, (e: unknown) => void> = {};
    const doc = {
      addEventListener: (t: string, h: (e: unknown) => void) => (handlers[t] = h),
      removeEventListener: (t: string) => delete handlers[t]
    } as unknown as Document;
    const anchor = (href: string, attrs: Record<string, string> = {}, ancestors: Record<string, Record<string, string>> = {}) => {
      const el = {
        getAttribute: (n: string) => (n === "href" ? href : (attrs[n] ?? null)),
        closest: (sel: string) => {
          if (sel === "a[href]") return el;
          if (sel === "[data-track-offer]") return attrs["data-track-offer"] ? el : ancestors.offer ? { getAttribute: (n: string) => ancestors.offer[n] ?? null } : null;
          if (sel === "footer") return ancestors.footer ? {} : null;
          return null;
        }
      };
      return el;
    };
    const stop = listenWhatsAppClicks(doc);
    handlers.click({ type: "click", button: 0, target: anchor("https://wa.me/966", { "data-track-cta": "lead_success_whatsapp", "data-track-offer": "pkg:store-growth" }) });
    handlers.click({ type: "click", button: 0, target: anchor("https://wa.me/966", {}, { footer: {} }) });
    handlers.click({ type: "click", button: 0, target: anchor("/quote") });
    handlers.auxclick({ type: "auxclick", button: 2, target: anchor("https://wa.me/966") });
    handlers.auxclick({ type: "auxclick", button: 1, target: anchor("https://wa.me/966", {}, { offer: { "data-track-offer": "offer:nov" } }) });
    expect(w.dataLayer).toEqual([
      { event: "click_cta", cta: "lead_success_whatsapp", channel: "whatsapp", offer: "pkg:store-growth", page: "/offers/store-growth" },
      { event: "click_cta", cta: "footer_whatsapp", channel: "whatsapp", page: "/offers/store-growth" },
      { event: "click_cta", cta: "whatsapp_link", channel: "whatsapp", offer: "offer:nov", page: "/offers/store-growth" }
    ]);
    stop();
    expect(Object.keys(handlers)).toEqual([]);
  });
});

describe("lead capture: event id and click ids reach the CRM", () => {
  beforeEach(async () => {
    await resetDb();
    await setupOrg();
  });

  it("9. the browser event id and the new click ids are kept in captureMeta (no migration)", async () => {
    vi.stubEnv("OS_ORG_SLUG", "test-org");
    const eventId = newEventId();
    await captureWebsiteLead(lead({ eventId, utm: { utm_source: "google", gbraid: "GB1", wbraid: "WB1", li_fat_id: "LI1" } }));
    const meta = (await prisma.lead.findFirstOrThrow()).captureMeta as { eventId: string; utm: Record<string, string> };
    expect(meta.eventId).toBe(eventId);
    expect(meta.utm).toEqual({ utm_source: "google", gbraid: "GB1", wbraid: "WB1", li_fat_id: "LI1" });
  });

  it("10. a lead without an event id still saves; a malformed one is refused", async () => {
    vi.stubEnv("OS_ORG_SLUG", "test-org");
    await captureWebsiteLead(lead());
    expect(((await prisma.lead.findFirstOrThrow()).captureMeta as { eventId: unknown }).eventId).toBeNull();
    expect(websiteLeadSchema.safeParse(lead({ eventId: "not-a-uuid" })).success).toBe(false);
  });
});
