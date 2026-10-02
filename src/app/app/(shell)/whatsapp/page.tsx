import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can, canAny } from "@/server/context";
import { listConversations } from "@/server/whatsapp/service";
import { connectionFor } from "@/server/integrations/registry";
import { integrationsTickIfDue } from "@/server/integrations/worker";
import { consentAction } from "@/lib/os/integrations-actions";
import { integrationTone, matchTone } from "@/lib/os/integrations-page";
import { Badge, EmptyState, flatParams, fmtDateTime, PageHeader, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { ActionForm } from "@/components/hr/Forms";

export const metadata = { title: "WhatsApp" };
const FILTERS = ["all", "unmatched", "ambiguous", "matched"] as const;

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await pageCtx();
  if (!can(ctx, "whatsapp.view")) return <PermissionDenied permission="whatsapp.view" />;
  const sp = flatParams(await searchParams);
  const t = await getTranslations("os.integrations");
  const locale = await getLocale();
  await integrationsTickIfDue(ctx.organizationId);
  const filter = (FILTERS as readonly string[]).includes(sp.filter ?? "") ? sp.filter : "all";
  const [d, conn] = await Promise.all([listConversations(ctx, { filter, q: sp.q }), connectionFor(ctx.organizationId, "WHATSAPP")]);
  const status = conn?.status ?? "NOT_CONFIGURED";

  return (
    <div className="grid gap-5">
      <PageHeader
        icon="MessagesSquare"
        title={t("wa.title")}
        subtitle={t("wa.subtitle")}
        actions={
          <span className="flex flex-wrap gap-1.5">
            <Link href="/app/whatsapp/templates" className="os-btn-secondary">{t("wa.templates")}</Link>
            {canAny(ctx, "whatsapp.manage", "marketing.manage") && (
              <ActionForm
                action={consentAction}
                trigger={t("wa.consent")}
                triggerClass="os-btn-ghost"
                submitLabel={t("a.save")}
                note={t("wa.consentNote")}
                fields={[
                  { name: "address", label: t("f.phone"), required: true, dir: "ltr" },
                  { name: "status", label: t("f.consent"), type: "select", required: true, options: ["OPTED_IN", "OPTED_OUT", "BLOCKED"].map((s) => ({ value: s, label: t(`consent.${s}` as "consent.OPTED_IN") })) },
                  { name: "source", label: t("f.source"), required: true, value: "manual", hint: t("wa.consentSourceHint") },
                  { name: "note", label: t("f.note"), type: "textarea", hint: t("wa.reoptHint") }
                ]}
              />
            )}
          </span>
        }
      />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-os-line px-4 py-3 text-xs">
        <span className="text-os-muted">{t("wa.connection")}</span>
        <Badge tone={integrationTone(status)} dot>{t(`st.${status}` as "st.NOT_CONFIGURED")}</Badge>
        {conn?.environment === "SANDBOX" && <Badge tone="warning">{t("env.SANDBOX")}</Badge>}
        {status !== "CONNECTED" && status !== "DEGRADED" && <span className="text-os-muted">{t("wa.notConnectedText")}</span>}
        {can(ctx, "integrations.view") && <Link href="/app/integrations" className="ms-auto text-iris-light hover:underline">{t("title")}</Link>}
      </div>
      <nav className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Link key={f} href={`?filter=${f}`} className={`rounded-full border px-3 py-1 text-xs ${filter === f ? "border-iris bg-iris/10 text-os-text" : "border-os-line text-os-muted hover:text-os-text"}`}>
            {t(`wa.f.${f}` as "wa.f.all")}
            {f !== "all" && <span className="ms-1 tabular text-os-faint">{d.counts[f.toUpperCase() as "MATCHED"] ?? 0}</span>}
          </Link>
        ))}
      </nav>
      <div className="os-card overflow-hidden">
        <FilterBar search={{ placeholder: t("wa.search") }} />
        {d.rows.length === 0 ? (
          <EmptyState icon="MessagesSquare" title={t("wa.empty")} text={status === "CONNECTED" ? t("wa.emptyText") : t("wa.emptyNotConnected")} />
        ) : (
          <ul className="divide-y divide-os-line">
            {d.rows.map((c) => {
              const m = c.messages[0];
              return (
                <li key={c.id}>
                  <Link href={`/app/whatsapp/${c.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-os-raised">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {c.profileName ?? <span dir="ltr">+{c.waId}</span>}
                        <Badge tone={matchTone(c.matchState)}>{t(`match.${c.matchState}` as "match.MATCHED")}</Badge>
                      </p>
                      <p className="truncate text-xs text-os-muted">
                        {m ? `${m.direction === "OUTBOUND" ? "↗ " : ""}${m.body ?? `[${m.messageType}]`}` : "—"}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-[11px] text-os-faint">{c.lastMessageAt ? fmtDateTime(c.lastMessageAt, locale) : ""}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
