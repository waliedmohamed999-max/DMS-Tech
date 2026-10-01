import { Link } from "@/i18n/navigation";
import type { Integration } from "@/content/types";
import { BrandIcon, hasBrand } from "@/components/ui/Brand";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Highlight } from "@/components/ui/Section";
import TechBackdrop from "@/components/ui/TechBackdrop";
import { QuickLead } from "@/components/forms/LeadForm";

const arrowFor = (locale: string) => (locale === "ar" ? "ArrowLeft" : "ArrowRight");

/** Six-card value grid */
export function ValueGrid({ items }: { items: { icon: IconName; title: string; description: string }[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((v) => (
        <div key={v.title} className="card grid content-start gap-3 p-6">
          <span className="badge-icon">
            <Icon name={v.icon} />
          </span>
          <h3 className="text-xl font-semibold tracking-[-0.5px]">{v.title}</h3>
          <p className="text-[15px] text-iron">{v.description}</p>
        </div>
      ))}
    </div>
  );
}

/** Kept for inner pages (about, careers) */
export function ValueBadges({ values }: { values: { icon: IconName; title: string; description: string }[] }) {
  return <ValueGrid items={values} />;
}

function IntegrationTile({ item }: { item: Integration }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 rounded-full border border-mist bg-white px-5 text-sm font-semibold text-ink shadow-card" dir="ltr">
      {hasBrand(item.slug) ? (
        <BrandIcon slug={item.slug!} size={22} colored />
      ) : (
        <span className="grid size-6 place-items-center rounded-icon bg-ink text-[11px] font-bold text-white">{item.name[0]}</span>
      )}
      {item.name}
    </div>
  );
}

/** Integration pills in alternating marquee rows (clients page) */
export function IntegrationsWall({ rows }: { rows: Integration[][] }) {
  return (
    <div className="grid gap-4 [--marquee-shift:-50%] [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]" dir="ltr">
      {rows.map((row, i) => (
        <div key={i} className="overflow-hidden py-1">
          <div className={`flex w-max gap-4 animate-marquee hover:[animation-play-state:paused] ${i % 2 ? "[animation-direction:reverse]" : ""}`}>
            {[...row, ...row].map((item, j) => (
              <IntegrationTile key={`${item.name}-${j}`} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Obsidian closing CTA — centred gradient headline + lead capture */
export function FinalCta({ title, sub, input, button, alt, checks }: { title: string; sub: string; input: string; button: string; alt: string; checks: string[] }) {
  return (
    <section className="on-dark relative overflow-hidden py-24 text-center md:py-32">
      <TechBackdrop circuits={false} />
      <div className="container-site relative grid justify-items-center gap-5">
        <h2 className="h-display max-w-3xl">
          <Highlight text={title} />
        </h2>
        <p className="lead max-w-2xl">{sub}</p>
        <div className="mt-4 flex w-full justify-center">
          <QuickLead placeholder={input} button={button} alt={alt} source="cta" dark />
        </div>
        <ul className="mt-4 flex flex-wrap justify-center gap-x-7 gap-y-2 text-sm text-[#c4c6c8]">
          {checks.map((c) => (
            <li key={c} className="inline-flex items-center gap-2">
              <Icon name="CircleCheck" size={16} className="text-iris-light" /> {c}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
