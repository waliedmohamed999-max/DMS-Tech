import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { clientOptions, listContacts } from "@/server/crm/clients";
import { can } from "@/server/context";
import { waLink } from "@/lib/os/crm-page";
import { Avatar, Badge, EmptyState, flatParams, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { ContactForm } from "@/components/crm/CrmForms";
import { Icon } from "@/components/ui/Icon";

export const metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("crm.contacts.view");
  if (!allowed) return <PermissionDenied permission="crm.contacts.view" />;
  const sp = flatParams(await searchParams);
  const t = await getTranslations("os");
  const [data, clients] = await Promise.all([listContacts(ctx, sp), can(ctx, "crm.contacts.create") && can(ctx, "crm.clients.view") ? clientOptions(ctx) : Promise.resolve([])]);
  const opts = clients.map((c) => ({ id: c.id, label: `${c.displayName} · ${c.number}` }));

  return (
    <>
      <PageHeader icon="Users" title={t("crm.contacts.title")} subtitle={t("crm.contacts.subtitle")} actions={can(ctx, "crm.contacts.create") ? <ContactForm trigger="newAuto" clients={opts} /> : null} />
      <div className="os-card overflow-hidden">
        <FilterBar search={{ placeholder: t("common.search") }} />
        {data.items.length === 0 ? (
          <EmptyState icon="Users" title={t("crm.contacts.emptyTitle")} text={t("crm.contacts.emptyText")} />
        ) : (
          <ul className="divide-y divide-os-line">
            {data.items.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={x.firstName} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">
                    {x.firstName} {x.lastName} {x.isPrimary && <Badge tone="iris">{t("crm.f.primary")}</Badge>}
                  </p>
                  <p className="truncate text-xs text-os-muted">
                    {x.client ? (
                      <Link href={`/app/crm/clients/${x.client.id}?tab=contacts`} className="hover:text-iris-light">
                        {x.client.displayName}
                      </Link>
                    ) : (
                      t("crm.contacts.noClient")
                    )}
                    {[x.jobTitle, x.email].filter(Boolean).map((v) => ` · ${v}`)}
                  </p>
                </div>
                {x.phone && (
                  <a href={`tel:${x.phone}`} className="os-btn-ghost h-8 px-2" aria-label={t("crm.a.call")}>
                    <Icon name="PhoneCall" size={14} />
                  </a>
                )}
                {waLink(x.whatsapp ?? x.phone) && (
                  <a href={waLink(x.whatsapp ?? x.phone)!} target="_blank" rel="noopener noreferrer" className="os-btn-ghost h-8 px-2" aria-label="WhatsApp">
                    <Icon name="MessagesSquare" size={14} />
                  </a>
                )}
                {can(ctx, "crm.contacts.edit") && <ContactForm trigger="edit" clients={opts} contact={x} />}
              </li>
            ))}
          </ul>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/crm/contacts" params={sp} />
      </div>
    </>
  );
}
