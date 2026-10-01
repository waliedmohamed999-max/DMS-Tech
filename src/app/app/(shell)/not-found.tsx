import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/os/ui";

export default async function OsNotFound() {
  const t = await getTranslations("os");
  return (
    <div className="os-card mx-auto mt-10 max-w-lg">
      <EmptyState icon="Search" title={t("errors.NOT_FOUND")} text="404" action={<Link href="/app" className="os-btn-secondary mt-2">{t("denied.home")}</Link>} />
    </div>
  );
}
