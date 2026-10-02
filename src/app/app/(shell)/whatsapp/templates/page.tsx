import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { listTemplates } from "@/server/whatsapp/service";
import { connectionFor } from "@/server/integrations/registry";
import { waSyncTemplatesAction } from "@/lib/os/integrations-actions";
import { Badge, EmptyState, fmtDateTime, PageHeader, PermissionDenied } from "@/components/os/ui";
import { RunButton } from "@/components/hr/Forms";

export const metadata = { title: "WhatsApp templates" };

export default async function TemplatesPage() {
  const { ctx } = await pageCtx();
  if (!can(ctx, "whatsapp.view")) return <PermissionDenied permission="whatsapp.view" />;
  const t = await getTranslations("os.integrations");
  const locale = await getLocale();
  const [rows, conn] = await Promise.all([listTemplates(ctx), connectionFor(ctx.organizationId, "WHATSAPP")]);
  const connected = conn?.status === "CONNECTED" || conn?.status === "DEGRADED";
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="MessagesSquare"
        title={t("wa.templates")}
        subtitle={t("wa.templatesSubtitle")}
        actions={
          <span className="flex gap-1.5">
            <Link href="/app/whatsapp" className="os-btn-ghost">{t("wa.title")}</Link>
            {can(ctx, "whatsapp.manage") && connected && <RunButton action={waSyncTemplatesAction} label={t("wa.a.sync")} className="os-btn-secondary" />}
          </span>
        }
      />
      {!connected && <p className="rounded-lg border border-os-line px-4 py-3 text-xs text-os-muted">{t("wa.syncNotConnected")}</p>}
      <div className="os-card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon="MessagesSquare" title={t("wa.noTemplatesTitle")} text={t("wa.noTemplatesText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead><tr><th>{t("f.template")}</th><th>{t("f.language")}</th><th className="hidden md:table-cell">{t("f.category")}</th><th>{t("logs.status")}</th><th className="hidden md:table-cell">{t("wa.synced")}</th></tr></thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id}>
                    <td className="font-medium" dir="ltr">{x.name}</td>
                    <td dir="ltr">{x.language}</td>
                    <td className="hidden text-xs md:table-cell">{x.category ?? "—"}</td>
                    <td><Badge tone={x.status === "APPROVED" ? "success" : x.status === "REJECTED" || x.status === "DISABLED" ? "danger" : "warning"}>{t(`tpl.${x.status}` as "tpl.APPROVED")}</Badge></td>
                    <td className="hidden text-xs md:table-cell">{x.syncedAt ? fmtDateTime(x.syncedAt, locale) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
