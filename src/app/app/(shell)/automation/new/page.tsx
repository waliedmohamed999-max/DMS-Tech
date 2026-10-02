import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { createRuleAction } from "@/lib/os/system-actions";
import { builderProps } from "@/lib/os/system-page";
import { PageHeader, PermissionDenied } from "@/components/os/ui";
import { RuleBuilder } from "@/components/system/RuleBuilder";

export const metadata = { title: "New business rule" };

export default async function NewRulePage() {
  const { ctx } = await pageCtx();
  if (!can(ctx, "automation.manage")) return <PermissionDenied permission="automation.manage" />;
  const t = await getTranslations("os.system");
  const locale = await getLocale();
  const props = await builderProps(ctx, locale, (e) => (t.has(`trigger.${e}`) ? t(`trigger.${e}` as "trigger.lead.created") : e));
  return (
    <div className="grid gap-5">
      <PageHeader icon="Workflow" title={t("newRule")} subtitle={t("newRuleSubtitle")} actions={<Link href="/app/automation" className="os-btn-ghost">{t("rules")}</Link>} />
      <p className="rounded-lg border border-os-line px-4 py-3 text-xs text-os-muted">{t("createdDisabled")}</p>
      <RuleBuilder action={createRuleAction} {...props} redirect="/app/automation/:id" submitLabel={t("save")} />
    </div>
  );
}
