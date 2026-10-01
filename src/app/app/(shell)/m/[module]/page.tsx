import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { findModule } from "@/lib/os/modules";
import { Icon } from "@/components/ui/Icon";
import { Badge, PermissionDenied } from "@/components/os/ui";

export const metadata = { title: "Planned module" };

/**
 * Honest placeholder for modules that are not built yet: explains the module and its
 * delivery phase. It never renders fake data or non-working forms.
 */
export default async function PlannedModule({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const mod = findModule(module);
  if (!mod || mod.live) notFound();
  const { allowed } = await pageCtx(mod.permission);
  if (!allowed) return <PermissionDenied permission={mod.permission!} />;
  const locale = (await getLocale()) as "ar" | "en";
  const t = await getTranslations("os.planned");

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="os-card overflow-hidden">
        <div className="flex items-center gap-4 border-b border-os-line p-6">
          <span className="grid size-12 place-items-center rounded-xl border border-os-line bg-os-raised text-iris-light">
            <Icon name={mod.icon} size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">{mod.label[locale]}</h1>
            <p className="text-sm text-os-muted">{t("title")}</p>
          </div>
          <Badge tone="warning">{t("badge", { n: mod.phase })}</Badge>
        </div>
        <div className="grid gap-5 p-6 text-sm leading-relaxed">
          <div>
            <h2 className="mb-1 font-semibold">{t("what")}</h2>
            <p className="text-os-muted">{mod.about[locale]}</p>
          </div>
          <div>
            <h2 className="mb-1 font-semibold">{t("why")}</h2>
            <p className="text-os-muted">{t("whyText")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/app" className="os-btn-secondary">
              {locale === "ar" ? "مركز القيادة" : "Command Center"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
