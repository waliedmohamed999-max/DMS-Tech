import { getLocale } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { catalogEditorState } from "@/server/website/catalog";
import { PageHeader, PermissionDenied } from "@/components/os/ui";
import { OffersEditor } from "@/components/os/OffersEditor";
import { services } from "@/content/services";

export const metadata = { title: "Packages & offers page" };

/**
 * The website's /offers page, edited here: sections and their packages, limited-time offers and every text on the page.
 * Changes are saved to a working copy, previewed on the real page (?preview=draft) and go live only when published.
 */
export default async function WebsiteOffersPage() {
  const { ctx, allowed } = await pageCtx("website.offers.view");
  if (!allowed) return <PermissionDenied permission="website.offers.view" />;
  const locale = (await getLocale()) === "en" ? "en" : "ar";
  const s = await catalogEditorState(ctx);
  const ar = locale === "ar";
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="Tag"
        title={ar ? "صفحة الباقات والعروض" : "Packages & offers page"}
        subtitle={
          ar
            ? "عدّل الأقسام والباقات والعروض ونصوص صفحة العروض في الموقع. التعديلات تُحفظ كمسودة، تعاينها على الصفحة الحقيقية، ثم تظهر للزوار بعد النشر."
            : "Edit the sections, packages, offers and texts of the website's offers page. Changes are saved as a draft, previewed on the real page, and reach visitors once published."
        }
      />
      <OffersEditor
        locale={locale}
        initial={JSON.parse(JSON.stringify(s.catalog))}
        state={{
          hasDraft: s.hasDraft,
          draftSavedAt: s.draftSavedAt?.toISOString() ?? null,
          draftSavedBy: s.draftSavedBy,
          live: s.live ? { version: s.live.version, publishedAt: s.live.publishedAt?.toISOString() ?? null, publishedBy: s.live.publishedBy } : null,
          problems: s.problems,
          notes: s.notes,
          history: s.history.map((h) => ({ ...h, publishedAt: h.publishedAt?.toISOString() ?? null }))
        }}
        canEdit={can(ctx, "website.offers.edit")}
        canPublish={can(ctx, "website.offers.publish")}
        me={ctx.userName}
        services={services.map((x) => ({ value: x.slug, label: x.title[locale] }))}
      />
    </div>
  );
}
