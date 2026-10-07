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

/** Numbered steps on a dark (.on-dark) section. */
export function DarkSteps({ steps }: { steps: { icon: IconName; title: string; text: string }[] }) {
  return (
    <ol className={`grid gap-px overflow-hidden rounded-card border border-white/10 bg-white/10 sm:grid-cols-2 ${STEP_COLS[steps.length] ?? "lg:grid-cols-4"}`}>
      {steps.map((s, i) => (
        <li key={s.title} className="grid content-start gap-3 bg-obsidian p-7">
          <span className="flex items-center justify-between">
            <span className="grid size-9 place-items-center rounded-icon bg-white/5 text-iris-light">
              <Icon name={s.icon} size={17} />
            </span>
            <span className="font-mono text-xs text-[#8d8e8f]">{String(i + 1).padStart(2, "0")}</span>
          </span>
          <h3 className="text-lg font-bold">{s.title}</h3>
          <p className="text-[15px] leading-relaxed text-[#b4b5b6]">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
