import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { getConversation, type Candidate } from "@/server/whatsapp/service";
import { waLeadAction, waLinkAction, waNoteAction, waReplyAction, waTicketAction } from "@/lib/os/integrations-actions";
import { consentTone, integrationTone, matchTone } from "@/lib/os/integrations-page";
import { Badge, fmtDateTime, SectionCard } from "@/components/os/ui";
import { ActionForm, RunButton } from "@/components/hr/Forms";

export const metadata = { title: "WhatsApp conversation" };
const PERM = { lead: "crm.leads.view", contact: "crm.contacts.view", client: "crm.clients.view" } as const;

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await pageCtx();
  const t = await getTranslations("os.integrations");
  const locale = await getLocale();
  let d;
  try {
    d = await getConversation(ctx, id);
  } catch (e) {
    if (isAppError(e)) notFound();
    throw e;
  }
  const c = d.conversation;
  const send = can(ctx, "whatsapp.send");
  const connected = d.connectionStatus === "CONNECTED" || d.connectionStatus === "DEGRADED";
  // candidates are shown only to people allowed to see that kind of CRM record
  const candidates = ((c.candidates ?? []) as Candidate[]).filter((x) => can(ctx, PERM[x.type]));

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/whatsapp" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {c.profileName ?? <span dir="ltr">+{c.waId}</span>}
            <Badge tone={matchTone(c.matchState)}>{t(`match.${c.matchState}` as "match.MATCHED")}</Badge>
            <Badge tone={consentTone(d.consent)}>{t(`consent.${d.consent}` as "consent.OPTED_IN")}</Badge>
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-os-muted">
            <span dir="ltr">+{c.waId}</span>
            <span>{d.windowOpen ? t("wa.windowOpen") : t("wa.windowClosed")}</span>
            <span className="inline-flex items-center gap-1">{t("wa.connection")} <Badge tone={integrationTone(d.connectionStatus)}>{t(`st.${d.connectionStatus}` as "st.NOT_CONFIGURED")}</Badge></span>
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
          {!c.leadId && can(ctx, "crm.leads.create") && (
            <ActionForm action={waLeadAction} args={[id]} trigger={t("wa.a.createLead")} triggerClass="os-btn-secondary" submitLabel={t("wa.a.createLead")} redirect="/app/crm/leads/:id" note={t("wa.leadNote")}
              fields={[{ name: "name", label: t("f.name"), required: true, value: c.profileName ?? "" }, { name: "companyName", label: t("f.company") }, { name: "notes", label: t("f.note"), type: "textarea" }]} />
          )}
          {!c.ticketId && can(ctx, "support.tickets.create") && (
            <ActionForm action={waTicketAction} args={[id]} trigger={t("wa.a.createTicket")} triggerClass="os-btn-ghost" submitLabel={t("wa.a.createTicket")} redirect="/app/support/tickets/:id" note={t("wa.ticketNote")}
              fields={[{ name: "subject", label: t("f.subject"), required: true }, { name: "priority", label: t("f.priority"), type: "select", value: "MEDIUM", options: ["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => ({ value: p, label: t(`prio.${p}` as "prio.LOW") })) }]} />
          )}
          {(c.leadId || c.clientId) && can(ctx, "crm.activities.create") && (
            <ActionForm action={waNoteAction} args={[id]} trigger={t("wa.a.note")} triggerClass="os-btn-ghost" submitLabel={t("a.save")} fields={[{ name: "body", label: t("f.note"), type: "textarea", required: true }]} />
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <SectionCard title={t("wa.messages")}>
          <ol className="grid max-h-[60vh] gap-2 overflow-y-auto p-4">
            {c.messages.map((m) => (
              <li key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.direction === "INBOUND" ? "justify-self-start bg-os-raised" : "justify-self-end bg-iris/15"}`}>
                <p className="whitespace-pre-wrap break-words" dir="auto">{m.body ?? `[${m.messageType}]`}</p>
                <p className="mt-1 flex gap-2 text-[10px] text-os-faint">
                  <span>{fmtDateTime(m.sentAt ?? m.createdAt, locale)}</span>
                  {m.direction === "OUTBOUND" && <span>{t(`msg.${m.status}` as "msg.SENT")}{m.errorCode ? ` · ${m.errorCode}` : ""}</span>}
                </p>
              </li>
            ))}
          </ol>
          {send && (
            <div className="flex flex-wrap gap-2 border-t border-os-line p-3">
              {!connected ? (
                <p className="text-xs text-os-muted">{t("wa.replyNotConnected")}</p>
              ) : d.consent === "BLOCKED" ? (
                <p className="text-xs text-danger">{t("wa.blocked")}</p>
              ) : (
                <>
                  {d.windowOpen && <ActionForm action={waReplyAction} args={[id]} trigger={t("wa.a.reply")} triggerClass="os-btn-primary" submitLabel={t("wa.a.send")} fields={[{ name: "body", label: t("f.message"), type: "textarea", required: true }]} />}
                  {d.templates.length > 0 ? (
                    <ActionForm action={waReplyAction} args={[id]} trigger={t("wa.a.template")} triggerClass={d.windowOpen ? "os-btn-ghost" : "os-btn-primary"} submitLabel={t("wa.a.send")} note={d.windowOpen ? undefined : t("wa.templateRequired")}
                      fields={[{ name: "templateId", label: t("f.template"), type: "select", required: true, options: d.templates.map((x) => ({ value: x.id, label: `${x.name} · ${x.language}` })) }, { name: "params", label: t("f.params"), hint: t("paramsHint"), dir: "ltr" }]} />
                  ) : (
                    !d.windowOpen && <p className="text-xs text-os-muted">{t("wa.noTemplates")}</p>
                  )}
                </>
              )}
            </div>
          )}
        </SectionCard>

        <div className="grid content-start gap-4">
          <SectionCard title={t("wa.linked")}>
            <div className="grid gap-2 p-4 text-sm">
              {d.lead && <Link href={`/app/crm/leads/${d.lead.id}`} className="hover:text-iris-light">{t("wa.lead")}: <span dir="ltr">{d.lead.number}</span> · {d.lead.name}</Link>}
              {d.client && <Link href={`/app/crm/clients/${d.client.id}`} className="hover:text-iris-light">{t("wa.client")}: {d.client.displayName}</Link>}
              {d.contact && <span>{t("wa.contact")}: {`${d.contact.firstName} ${d.contact.lastName ?? ""}`}</span>}
              {d.ticket && <Link href={`/app/support/tickets/${d.ticket.id}`} className="hover:text-iris-light">{t("wa.ticket")}: <span dir="ltr">{d.ticket.number}</span> · {d.ticket.subject}</Link>}
              {!d.lead && !d.client && !d.contact && !d.ticket && <p className="text-xs text-os-muted">{c.matchState === "MATCHED" ? t("wa.linkedHidden") : t("wa.notLinked")}</p>}
            </div>
          </SectionCard>
          {c.matchState === "AMBIGUOUS" && (
            <SectionCard title={t("wa.candidates")}>
              <div className="grid gap-2 p-4 text-sm">
                <p className="text-xs text-warning">{t("wa.ambiguousText")}</p>
                {candidates.map((x) => (
                  <div key={`${x.type}:${x.id}`} className="flex items-center justify-between gap-2">
                    <span>{t(`wa.${x.type}` as "wa.lead")}: {x.label}</span>
                    {send && <RunButton action={waLinkAction} args={[id, { type: x.type, targetId: x.id }]} label={t("wa.a.link")} className="os-btn-ghost text-xs" />}
                  </div>
                ))}
                {candidates.length === 0 && <p className="text-xs text-os-muted">{t("wa.candidatesHidden")}</p>}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
