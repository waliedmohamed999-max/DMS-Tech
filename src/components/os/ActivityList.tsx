import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Avatar, fmtRelative } from "./ui";

type Item = {
  id: string;
  verb: string;
  entityLabel: string | null;
  href: string | null;
  createdAt: Date;
  actor: { name: string; nameAr: string | null } | null;
};

/** Timeline of activity rows: "<actor> <verb> <entity>". */
export default async function ActivityList({ items }: { items: Item[] }) {
  const t = await getTranslations("os.activity");
  const locale = await getLocale();
  return (
    <ol className="divide-y divide-os-line">
      {items.map((a) => {
        const actor = a.actor ? (locale === "ar" && a.actor.nameAr) || a.actor.name : t("system");
        const vk = `verbs.${a.verb.replace(/\./g, "_")}`;
        const verb = t.has(vk) ? t(vk as "verbs.user_created") : a.verb;
        return (
          <li key={a.id} className="flex items-start gap-3 px-4 py-3">
            <Avatar name={actor} />
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-os-muted">
              <span className="font-medium text-os-text">{actor}</span> {verb}{" "}
              {a.entityLabel &&
                (a.href ? (
                  <Link href={a.href} className="font-medium text-os-text hover:text-iris-light">
                    {a.entityLabel}
                  </Link>
                ) : (
                  <span className="font-medium text-os-text">{a.entityLabel}</span>
                ))}
            </p>
            <time className="shrink-0 text-xs text-os-faint" dateTime={a.createdAt.toISOString()}>
              {fmtRelative(a.createdAt, locale)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
