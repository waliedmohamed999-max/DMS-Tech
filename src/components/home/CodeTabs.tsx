"use client";

import { useState } from "react";

const tabs: { id: string; lines: string[] }[] = [
  {
    id: "Zid",
    lines: ["store:", "  platform: zid", "  theme: dms-commerce", "  payments: [mada, apple-pay, tabby]", "  shipping: [smsa, aramex]", "  automation:", "    abandoned-cart: whatsapp", "    order-status: whatsapp", "    reviews: auto-request"]
  },
  {
    id: "Salla",
    lines: ["store:", "  platform: salla", "  theme: dms-commerce", "  payments: [mada, apple-pay, tamara]", "  shipping: [smsa, spl]", "  automation:", "    abandoned-cart: whatsapp", "    loyalty: points", "    reports: weekly"]
  },
  {
    id: "Shopify",
    lines: ["store:", "  platform: shopify", "  markets: [sa, ae, kw]", "  apps: [klaviyo, judge-me]", "  checkout: optimized", "  automation:", "    abandoned-cart: email + whatsapp", "    inventory-sync: odoo", "    analytics: ga4"]
  },
  {
    id: "WhatsApp",
    lines: ["flow: lead-qualification", "  trigger: new-message", "  ask: [service, budget, city]", "  route:", "    hot: sales-team", "    support: helpdesk", "  sync: crm/leads", "  follow-up: 24h", "  language: [ar, en]"]
  },
  {
    id: "API",
    lines: ["integration:", "  source: website-forms", "  destinations:", "    - hubspot/contacts", "    - odoo/crm.lead", "    - slack/#sales", "  retries: 3", "  webhook: /api/leads", "  status: live"]
  }
];

/** Specify "export production-ready code" window, with platform tabs */
export default function CodeTabs() {
  const [active, setActive] = useState(0);
  const tab = tabs[active];
  return (
    <div dir="ltr" className="overflow-hidden rounded-ss-card border-s border-t border-mist bg-white text-start shadow-lg">
      <div className="flex items-stretch border-b border-mist bg-cloud text-[13px]">
        <span className="border-e border-mist px-4 py-2.5 text-iron">Output</span>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(i)}
            className={`border-e border-mist px-4 py-2.5 font-medium transition ${i === active ? "bg-iris text-white" : "text-ink hover:bg-white"}`}
          >
            {t.id}
          </button>
        ))}
      </div>
      <pre key={tab.id} className="h-[230px] overflow-hidden p-4 font-mono text-[13px] leading-6 text-ink motion-safe:animate-[fadeIn_.3s_ease]">
        {tab.lines.map((l, i) => (
          <div key={i} className="flex gap-4">
            <span className="w-5 shrink-0 text-graphite">{String(i + 1).padStart(2, "0")}</span>
            <span>
              {l.includes(":") ? (
                <>
                  <span className="text-iris">{l.slice(0, l.indexOf(":") + 1)}</span>
                  <span className="text-ink">{l.slice(l.indexOf(":") + 1)}</span>
                </>
              ) : (
                l
              )}
            </span>
          </div>
        ))}
      </pre>
    </div>
  );
}
