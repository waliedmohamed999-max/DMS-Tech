import { getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { getSettings } from "@/server/admin/org";
import { PageHeader, PermissionDenied } from "@/components/os/ui";
import { SettingsForm } from "@/components/os/AdminForms";

export const metadata = { title: "Company settings" };

export default async function SettingsPage() {
  const { ctx, allowed } = await pageCtx("admin.settings.manage");
  if (!allowed) return <PermissionDenied permission="admin.settings.manage" />;
  const t = await getTranslations("os.settings");
  const s = await getSettings(ctx);
  return (
    <>
      <PageHeader icon="Settings" title={t("title")} subtitle={t("subtitle")} />
      <SettingsForm s={s} editable />
    </>
  );
}
