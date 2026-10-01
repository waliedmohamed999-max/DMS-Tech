import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { followUps, type FollowUpItem } from "@/server/crm/insights";
import { scopeOf } from "@/server/crm/scope";
import { personName, waLink } from "@/lib/os/crm-page";
import { Badge, fmtDateTime, fmtRelative, PageHeader, PermissionDenied, SectionCard } from "@/components/os/ui";
import { Icon } from "@/components/ui/Icon";

export const metadata = { title: "Follow-ups" };

async function Bucket({ title, items, tone, locale }: { title: string; items: FollowUpItem[]; tone: "danger" | "warning" | "info"; locale: string }) {
  const t = await getTranslations("os.crm");
  return (
    <SectionCard title={title} action={<Badge tone={tone}>{items.length}</Badge>}>
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-os-muted">{t("followUps.empty")}</p>
      ) : (
        <ul className="divide-y divide-os-line">
          {items.map((i) => {
            const wa = waLink(i.whatsapp);
            return (
              <li key={`${i.kind}-${i.id}`} className="flex items-center gap-3 px-4 py-3">
                <span className={`grid size-8 shrink-0 place-items-center rounded-md ${i.kind === "lead" ? "bg-info/15 text-info" : "bg-iris/15 text-iris-light"}`}>
                  <Icon name={i.kind === "lead" ? "Filter" : "Target"} size={15} />
                </span>
                <Link href={i.href} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium hover:text-iris-light">{i.title}</span>
                  <span className="block truncate text-xs text-os-faint">
                    <span dir="ltr">{i.number}</span>
                    {i.subtitle && ` · ${i.subtitle}`} · {personName(i.owner, locale) ?? "—"}
                  </span>
                </Link>
                <span title={fmtDateTime(i.due, locale)} className={`hidden shrink-0 text-xs sm:block ${tone === "danger" ? "text-danger" : "text-os-muted"}`}>
                  {fmtRelative(i.due, locale)}
                </span>
                {i.phone && (
                  <a href={`tel:${i.phone}`} className="os-btn-ghost h-8 px-2" aria-label={t("a.call")}>
                    <Icon name="PhoneCall" size={14} />
                  </a>
                )}
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="os-btn-ghost h-8 px-2" aria-label="WhatsApp">
                    <Icon name="MessagesSquare" size={14} />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const { ctx, allowed } = await pageCtx("crm.leads.view");
  if (!allowed) return <PermissionDenied permission="crm.leads.view" />;
  const { who } = await searchParams;
  const all = who === "all" && scopeOf(ctx) !== "OWN";
  const locale = await getLocale();
  const t = await getTranslations("os.crm");
  const data = await followUps(ctx, { who: all ? "all" : "me" });

  return (
    <>
      <PageHeader
        icon="CalendarClock"
        title={t("followUps.title")}
        subtitle={t("followUps.subtitle")}
        actions={
          scopeOf(ctx) !== "OWN" ? (
            <div className="flex gap-1">
              <Link href="/app/crm/follow-ups" className={all ? "os-btn-secondary" : "os-btn-primary"}>
                {t("followUps.mine")}
              </Link>
              <Link href="/app/crm/follow-ups?who=all" className={all ? "os-btn-primary" : "os-btn-secondary"}>
                {t("followUps.all")}
              </Link>
            </div>
          ) : null
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Bucket title={t("followUps.overdue")} items={data.overdue} tone="danger" locale={locale} />
        <Bucket title={t("followUps.today")} items={data.today} tone="warning" locale={locale} />
        <Bucket title={t("followUps.upcoming")} items={data.upcoming} tone="info" locale={locale} />
      </div>
    </>
  );
}
