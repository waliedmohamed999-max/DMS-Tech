/**
 * Conversion events for the offers pages: view_offer, click_cta, generate_lead.
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
  (w.dataLayer ??= []).push({ event, ...params });
}
