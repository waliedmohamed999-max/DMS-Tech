import { getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { novaStatus } from "@/server/integrations/nova";
import { Badge, PageHeader, PermissionDenied, SectionCard } from "@/components/os/ui";
import { Icon } from "@/components/ui/Icon";

export const metadata = { title: "NOVA AI" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-os-line py-3 text-sm last:border-0 sm:grid-cols-[220px_1fr] sm:gap-4">
      <dt className="text-os-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/**
 * NOVA AI is an external DMS Tech platform. This page only shows integration status and
 * launches it — it never simulates NOVA features or data.
 */
export default async function NovaPage() {
  const { ctx, allowed } = await pageCtx("nova.use");
  if (!allowed) return <PermissionDenied permission="nova.use" />;
  const t = await getTranslations("os.nova");
  const s = novaStatus();
  const admin = can(ctx, "integrations.view");

  return (
    <div className="grid gap-6">
      <PageHeader
        icon="Sparkles"
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          s.configured ? (
            <a href="/app/nova/launch" target="_blank" rel="noopener" className="os-btn-primary" title={t("opensNewTab")}>
              <Icon name="Sparkles" size={15} /> {t("open")} <Icon name="ExternalLink" size={14} />
            </a>
          ) : null
        }
      />
      <div>
        <Badge tone="iris">{t("external")}</Badge>
      </div>

      {!s.configured && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">{s.invalidUrl ? t("invalidUrl") : t("notConfiguredText")}</p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <SectionCard title={t("statusTitle")}>
          <dl className="px-4">
            <Row label={t("connection")}>
              <Badge tone={s.configured ? "success" : "warning"} dot>
                {s.configured ? t("configured") : s.invalidUrl ? t("invalidUrl") : t("notConfigured")}
              </Badge>
            </Row>
            <Row label={t("platformUrl")}>
              {s.url ? (
                <span dir="ltr" className="font-mono text-xs">
                  {s.url}
                </span>
              ) : (
                "—"
              )}
            </Row>
            <Row label={t("access")}>{s.configured ? t("accessLink") : "—"}</Row>
            <Row label={t("sso")}>
              <span className="text-os-muted">{t("notAvailable")}</span>
            </Row>
            <Row label={t("api")}>
              <span className="text-os-muted">{t("notAvailable")}</span>
            </Row>
            <Row label={t("lastSync")}>
              <span className="text-os-muted">{t("never")}</span>
            </Row>
          </dl>
        </SectionCard>

        <div className="grid content-start gap-6">
          <SectionCard title={t("boundaryTitle")}>
            <div className="grid gap-3 p-4 text-sm leading-relaxed">
              <p className="flex gap-2.5">
                <Icon name="LayoutDashboard" size={16} className="mt-0.5 shrink-0 text-os-faint" />
                <span className="text-os-muted">{t("osOwns")}</span>
              </p>
              <p className="flex gap-2.5">
                <Icon name="Sparkles" size={16} className="mt-0.5 shrink-0 text-iris-light" />
                <span className="text-os-muted">{t("novaOwns")}</span>
              </p>
            </div>
          </SectionCard>
          {admin && (
            <SectionCard title={t("config")}>
              <div className="grid gap-3 p-4 text-sm">
                <code dir="ltr" className="w-fit rounded-md border border-os-line bg-os-raised px-2.5 py-1.5 text-xs">
                  NOVA_URL=https://…
                </code>
                <p className="leading-relaxed text-os-muted">{t("configHint")}</p>
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
