"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ProductMockup, type MockupKey } from "@/components/ui/ProductMockups";

export type ExplorerTool = { icon: IconName; title: string; text: string; points: string[]; visual: MockupKey };

/**
 * Product tools explorer (DMS Chat Bot / NOVA AI pages): pick a tool on one side, see its screen on the other.
 * On phones the screen opens under the chosen tool instead (an accordion). On desktop every screen shares one grid
 * cell and only the active one is visible, so switching never resizes the panel. No auto-rotation: the visitor
 * drives it.
 */
export default function ToolExplorer({ tools }: { tools: ExplorerTool[] }) {
  const locale = useLocale();
  const [active, setActive] = useState(0);
  // animate only after the visitor picks a tool: the first screen must never start hidden (motion is paused off-screen)
  const [picked, setPicked] = useState(false);
  const fade = picked ? "motion-safe:animate-[fadeIn_.35s_ease]" : "";

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
      <ul className="grid gap-2" role="tablist" aria-orientation="vertical">
        {tools.map((t, i) => {
          const on = i === active;
          return (
            <li key={t.title} className={`rounded-2xl border transition-colors duration-300 ${on ? "border-mist bg-white shadow-card" : "border-transparent hover:bg-white/70"}`}>
              <button
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setActive(i);
                  setPicked(true);
                }}
                className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3.5 p-4 text-start"
              >
                <span className={`grid size-10 place-items-center rounded-xl transition-colors duration-300 ${on ? "bg-iris text-white" : "bg-lilac text-iris"}`}>
                  <Icon name={t.icon} size={18} />
                </span>
                <span className="text-[16.5px] font-bold text-ink">{t.title}</span>
                <span className="font-mono text-xs text-graphite">{String(i + 1).padStart(2, "0")}</span>
              </button>
              {on && (
                <div role="tabpanel" className={`grid gap-3 px-4 pb-4 ${fade}`}>
                  <p className="text-[15px] leading-relaxed text-iron">{t.text}</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {t.points.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-[14px] font-medium text-ink">
                        <Icon name="CircleCheck" size={16} className="mt-0.5 shrink-0 text-iris" />
                        {p}
                      </li>
                    ))}
                  </ul>
                  {/* phones: the screen sits right under the chosen tool */}
                  <div className="mt-1 lg:hidden" aria-hidden>
                    <ProductMockup name={t.visual} locale={locale} />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="relative hidden lg:sticky lg:top-28 lg:block" aria-hidden>
        <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-lilac via-white to-lilac/40 blur-2xl" />
        <div className="grid">
          {tools.map((t, i) => {
            const on = i === active;
            return (
              <div key={on ? `on-${active}` : `off-${i}`} className={`col-start-1 row-start-1 ${on ? fade : "invisible"}`}>
                <ProductMockup name={t.visual} locale={locale} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
