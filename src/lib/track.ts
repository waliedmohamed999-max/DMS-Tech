/**
 * Conversion events for the public site: view_offer, click_cta, generate_lead.
 * They are pushed to window.dataLayer only — no tracking script is loaded and nothing leaves the page until the company
 * adds a tag manager (with visitor consent). Parameters never carry personal data (no name, phone or e-mail).
 */
type Params = Record<string, string | number | undefined>;
const sent = new Set<string>();

export function track(event: "view_offer" | "click_cta" | "generate_lead", params: Params = {}, onceKey?: string) {
  if (typeof window === "undefined") return;
  // one event per key per page view: a double click or a re-render never counts twice
  if (onceKey) {
    if (sent.has(onceKey)) return;
    sent.add(onceKey);
  }
  const w = window as unknown as { dataLayer?: unknown[] };
  // undefined parameters are dropped, so a tag manager never sees "offer: undefined"
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));
  (w.dataLayer ??= []).push({ event, ...clean });
}

/** SAR amount of a displayed price ("2,799", "SAR 3,899", "١٠٬٩٩٩ ر.س"), or undefined when there is none. */
export function priceValue(price?: string | number | null): number | undefined {
  if (price == null || price === "") return undefined;
  if (typeof price === "number") return Number.isFinite(price) && price > 0 ? price : undefined;
  // Arabic-Indic digits → ASCII, then keep digits and the decimal point only
  const ascii = price.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[٫]/g, ".");
  const n = Number(ascii.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Client-generated event id (UUID v4) shared by the browser event and the lead, for later browser/server dedup. */
export function newEventId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // randomUUID needs a secure context; getRandomValues does not
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** True for a WhatsApp chat link (wa.me, api.whatsapp.com/send, whatsapp:// deep links). */
export function isWhatsAppUrl(href: string | null | undefined): boolean {
  if (!href) return false;
  if (/^whatsapp:/i.test(href)) return true;
  try {
    const u = new URL(href, "https://dmstech.sa");
    return u.hostname === "wa.me" || ((u.hostname === "api.whatsapp.com" || u.hostname === "web.whatsapp.com") && u.pathname.startsWith("/send"));
  } catch {
    return false;
  }
}

/**
 * click_cta parameters for a click on a WhatsApp link, or null when the link is not WhatsApp.
 * `cta` comes from data-track-cta on the link; `offer` from data-track-offer on the link or the nearest ancestor.
 */
export function whatsappClickParams(link: { href: string | null; cta?: string | null; offer?: string | null; inFooter?: boolean }, page: string): Params | null {
  if (!isWhatsAppUrl(link.href)) return null;
  const cta = link.cta || (link.inFooter ? "footer_whatsapp" : "whatsapp_link");
  return { cta: cta.slice(0, 60), channel: "whatsapp", offer: link.offer?.slice(0, 160) || undefined, page: page.slice(0, 200) };
}

/**
 * One delegated listener for every WhatsApp <a> on the page (server-rendered links included): no inline handler, so
 * the strict public CSP (src/lib/csp/public.ts) is untouched. Buttons that open WhatsApp from script (WhatsAppOrder,
 * ShareLink) call track() themselves and are not <a>, so nothing is counted twice. Returns the cleanup.
 */
export function listenWhatsAppClicks(doc: Document = document): () => void {
  const onClick = (e: MouseEvent) => {
    if (e.type === "auxclick" && e.button !== 1) return; // middle click opens the link too; right click does not
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a) return;
    const params = whatsappClickParams(
      {
        href: a.getAttribute("href"),
        cta: a.getAttribute("data-track-cta"),
        offer: a.closest("[data-track-offer]")?.getAttribute("data-track-offer"),
        inFooter: !!a.closest("footer")
      },
      window.location.pathname
    );
    if (params) track("click_cta", params);
  };
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("auxclick", onClick, true);
  return () => {
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("auxclick", onClick, true);
  };
}
