import { Icon, type IconName } from "@/components/ui/Icon";

/** Building blocks shared by the product and service pages (NOVA AI, DMS Chat Bot, services). Server components. */

/** In-page anchor pills under a dark hero. */
export function SectionNav({ label, items }: { label: string; items: { id: string; label: string }[] }) {
  return (
    <nav aria-label={label} className="mx-auto flex flex-wrap justify-center gap-2">
      {items.map((s) => (
        <a key={s.id} href={`#${s.id}`} className="rounded-pill border border-white/15 px-4 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white">
          {s.label}
        </a>
      ))}
    </nav>
  );
}

/** Accordion FAQ (native <details>: no JavaScript); the first answer starts open. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="grid gap-3">
      {items.map((f, i) => (
        <details key={f.q} className="card group p-0 [&_summary::-webkit-details-marker]:hidden" open={i === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-6 text-lg font-semibold">
            {f.q}
            <Icon name="ChevronDown" size={20} className="shrink-0 text-graphite transition group-open:rotate-180" />
          </summary>
          <p className="px-6 pb-6 text-[15.5px] leading-relaxed text-iron">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

const STEP_COLS: Record<number, string> = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };

/**
 * Numbered steps on a dark (.on-dark) section, drawn as one path: on desktop the step circles sit on a horizontal
 * line; on phones the line runs down the start edge and each step reads as a timeline entry.
 */
export function DarkSteps({ steps }: { steps: { icon: IconName; title: string; text: string }[] }) {
  return (
    <ol className={`relative grid gap-8 lg:gap-6 ${STEP_COLS[steps.length] ?? "lg:grid-cols-4"}`}>
      {/* the path */}
      <span aria-hidden className="absolute inset-x-[8%] top-7 hidden h-px bg-gradient-to-r from-transparent via-iris-light/60 to-transparent lg:block" />
      <span aria-hidden className="absolute bottom-6 start-7 top-6 w-px bg-gradient-to-b from-iris-light/60 via-iris-light/30 to-transparent lg:hidden" />
      {steps.map((s, i) => (
        <li key={s.title} className="relative grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 lg:grid-cols-1 lg:justify-items-center lg:text-center">
          <span className="relative row-span-2 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-iris to-iris-soft text-white shadow-[0_0_0_6px_#151718,0_0_0_7px_rgba(169,155,255,.35)] lg:row-span-1">
            <Icon name={s.icon} size={22} />
            <span className="absolute -end-2 -top-2 grid size-6 place-items-center rounded-full bg-white text-[11px] font-bold text-ink" dir="ltr">
              {i + 1}
            </span>
          </span>
          <h3 className="self-end text-lg font-bold lg:mt-3">{s.title}</h3>
          <p className="max-w-xs text-[15px] leading-relaxed text-[#b4b5b6]">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
