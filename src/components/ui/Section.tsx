import type { ReactNode } from "react";
import TechBackdrop from "./TechBackdrop";

/**
 * Renders a headline where the part wrapped in *asterisks* becomes the iris keyword,
 * e.g. "Grow *faster*". Keeps copy (and dashboard-edited copy) free of markup.
 */
export function Highlight({ text }: { text: string }) {
  const parts = text.split(/\*(.+?)\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <span key={i} className="hl">
            {p}
          </span>
        ) : (
          p
        )
      )}
    </>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = "center",
  as: Tag = "h2",
  children
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  align?: "center" | "start";
  as?: "h1" | "h2";
  children?: ReactNode;
}) {
  const center = align === "center";
  return (
    <div className={`mb-12 grid gap-4 md:mb-14 ${center ? "mx-auto max-w-3xl justify-items-center text-center" : "max-w-3xl"}`}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <Tag className="h-display">
        <Highlight text={title} />
      </Tag>
      {sub && <p className="lead">{sub}</p>}
      {children}
    </div>
  );
}

/** Inner-page hero used by every page except home */
export function PageHero({
  eyebrow,
  title,
  sub,
  children
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <section className="on-dark relative overflow-hidden">
      <TechBackdrop />
      <div className="container-site relative py-16 md:py-24">
        <div className="mx-auto grid max-w-3xl justify-items-center gap-5 text-center">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h1 className="h-display">
            <Highlight text={title} />
          </h1>
          {sub && <p className="lead">{sub}</p>}
          {children}
        </div>
      </div>
    </section>
  );
}
