import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { listBillingCandidates } from "@/server/finance/eligibility";
import { editorData } from "@/lib/os/finance-page";
import { PageHeader, PermissionDenied, SectionCard } from "@/components/os/ui";
import { InvoiceEditor } from "@/components/finance/InvoiceEditor";
import { SourceList } from "@/components/finance/Widgets";

export const metadata = { title: "New invoice" };

/** Billing sources (explicit action per source) + manual operational invoice. `?type=&id=` highlights a source; `?mode=manual` opens the editor. */
export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ type?: string; id?: string; client?: string; project?: string; mode?: string }> }) {
  const { ctx, allowed } = await pageCtx("finance.invoices.create");
  if (!allowed) return <PermissionDenied permission="finance.invoices.create" />;
  const sp = await searchParams;
  const t = await getTranslations("os.finance");
  const manual = sp.mode === "manual";
  const all = manual ? [] : await listBillingCandidates(ctx, { clientId: sp.client, projectId: sp.project });
  const items = [...all].sort((a, b) => Number(b.eligible) - Number(a.eligible) || (sp.id === a.id ? -1 : sp.id === b.id ? 1 : 0));
  const ed = manual ? await editorData(ctx) : null;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { defaultLocale: true, currency: true } });
  return (
    <div className="grid gap-5">
      <PageHeader icon="FileText" title={t("newInvoice")} subtitle={t("newInvoiceSubtitle")} />
      <div className="flex gap-1 border-b border-os-line">
        <Link href="/app/finance/invoices/new" className={`-mb-px border-b-2 px-3 py-2 text-sm ${!manual ? "border-iris text-os-text" : "border-transparent text-os-muted"}`}>
          {t("fromSource")}
        </Link>
        <Link href="?mode=manual" className={`-mb-px border-b-2 px-3 py-2 text-sm ${manual ? "border-iris text-os-text" : "border-transparent text-os-muted"}`}>
          {t("manualInvoice")}
        </Link>
      </div>
      {!manual ? (
        <SectionCard title={t("billingSources")} action={<span className="text-[11px] text-os-faint">{t("eligibleCount", { n: items.filter((x) => x.eligible).length })}</span>}>
          <p className="border-b border-os-line px-4 py-2 text-[11px] text-os-faint">{t("sourcesNote")}</p>
          <SourceList items={items} highlight={sp.id} />
        </SectionCard>
      ) : (
        <InvoiceEditor
          initial={{ clientId: sp.client ?? "", contactId: "", language: org.defaultLocale, currency: org.currency, issueDate: "", dueDate: "", paymentTerms: "", notes: "", items: [] }}
          clients={ed!.clients}
          contactsByClient={ed!.contactsByClient}
          services={ed!.services}
          vatRate={ed!.vatRate}
        />
      )}
    </div>
  );
}
