"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/os/action";
import {
  clientOptionsAction,
  serviceChoicesAction,
  convertLeadAction,
  createClientAction,
  createContactAction,
  createLeadAction,
  createOpportunityAction,
  updateClientAction,
  updateContactAction,
  updateLeadAction,
  updateOpportunityAction
} from "@/lib/os/crm-actions";
import { LEAD_SOURCES, LEAD_STAGES, PRIORITIES } from "@/lib/crm/services";
import { Field, Modal, useErrorText } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";

export type Opt = { id: string; label: string };
type Res = ActionResult<{ id: string } | undefined> | null;

/** datetime-local value in the viewer's local time */
const dtLocal = (d?: Date | string | null) => {
  if (!d) return "";
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const dateOnly = (d?: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

function useFieldErrors(state: Res) {
  const err = useErrorText();
  const tc = useTranslations("os.crm.errors");
  return {
    field: (k: string) => {
      if (!state || state.ok || !state.field?.[k]) return undefined;
      const code = state.field[k];
      return tc.has(code) ? tc(code as "MONEY_FORMAT") : err("VALIDATION");
    },
    form: state && !state.ok ? (tc.has(state.error) ? tc(state.error as "MONEY_FORMAT") : err(state.error)) : undefined
  };
}

/** Modal that opens from a button or automatically from `?new=1`, then navigates to the created record. */
function useCreateModal(autoOpenParam: string | null, after: (id: string) => string) {
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(autoOpenParam ? params.get(autoOpenParam) === "1" : false);
  // closing the <dialog> fires onClose → close(); after a successful create that must not
  // replace the URL, or it would race (and win) against the push to the new record
  const navigating = useRef(false);
  const close = () => {
    setOpen(false);
    if (!navigating.current && autoOpenParam && params.get(autoOpenParam)) {
      const q = new URLSearchParams(params.toString());
      q.delete(autoOpenParam);
      router.replace(`?${q}`);
    }
  };
  const done = (r: Res) => {
    if (r?.ok && r.data && "id" in r.data) {
      navigating.current = true;
      setOpen(false);
      router.push(after(r.data.id));
    }
  };
  return { open, setOpen, close, done };
}

/** Catalog service picker (DB-backed). Legacy-only values stay visible as the current selection label. */
let serviceCache: Promise<{ id: string; nameAr: string; nameEn: string; category: string | null }[]> | null = null;
function ServiceSelect({ value }: { value?: string | null }) {
  const locale = useLocale();
  const [opts, setOpts] = useState<{ id: string; nameAr: string; nameEn: string; category: string | null }[] | null>(null);
  useEffect(() => {
    serviceCache ??= serviceChoicesAction().then((r) => (r.ok && r.data ? r.data : []));
    let live = true;
    void serviceCache.then((o) => live && setOpts(o));
    return () => {
      live = false;
    };
  }, []);
  return (
    <select name="serviceId" defaultValue={value ?? ""} key={opts ? "ready" : "loading"} className="os-input">
      <option value="">—</option>
      {opts?.map((s) => (
        <option key={s.id} value={s.id}>
          {locale === "ar" ? s.nameAr : s.nameEn}
        </option>
      ))}
    </select>
  );
}

const Select = ({ name, value, options, empty, required }: { name: string; value?: string | null; options: { value: string; label: string }[]; empty?: string; required?: boolean }) => (
  <select name={name} defaultValue={value ?? ""} required={required} className="os-input">
    {empty !== undefined && <option value="">{empty}</option>}
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

// ---------------------------------------------------------------------------
// Lead
// ---------------------------------------------------------------------------

type LeadValues = Partial<{
  id: string; name: string; companyName: string | null; email: string | null; phone: string | null; whatsapp: string | null; country: string | null; city: string | null;
  source: string; interestedService: string | null; serviceId: string | null; budgetMin: string | null; budgetMax: string | null; currency: string; ownerId: string | null; priority: string;
  stage: string; nextFollowUpAt: Date | string | null; notes: string | null;
}>;

function LeadFields({ v, owners, field, isEdit }: { v: LeadValues; owners: Opt[] | null; field: (k: string) => string | undefined; isEdit: boolean }) {
  const t = useTranslations("os.crm");
  const tp = useTranslations("os.priority");
  const locale = useLocale();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <Field label={t("f.name")} error={field("name")}>
        <input name="name" defaultValue={v.name} required className="os-input" />
      </Field>
      <Field label={t("f.company")}>
        <input name="companyName" defaultValue={v.companyName ?? ""} className="os-input" />
      </Field>
      <Field label={t("f.email")} error={field("email")}>
        <input name="email" type="email" defaultValue={v.email ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.phone")} error={field("phone")}>
        <input name="phone" type="tel" defaultValue={v.phone ?? ""} dir="ltr" placeholder="05xxxxxxxx" className="os-input" />
      </Field>
      <Field label={t("f.whatsapp")} error={field("whatsapp")}>
        <input name="whatsapp" type="tel" defaultValue={v.whatsapp ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.city")}>
        <input name="city" defaultValue={v.city ?? ""} className="os-input" />
      </Field>
      <Field label={t("f.source")}>
        <Select name="source" value={v.source ?? "MANUAL"} options={LEAD_SOURCES.map((s) => ({ value: s, label: t(`source.${s}`) }))} />
      </Field>
      <Field label={t("f.service")}>
        <ServiceSelect value={v.serviceId} />
      </Field>
      <Field label={t("f.budgetMin")} error={field("budgetMin")}>
        <input name="budgetMin" inputMode="decimal" defaultValue={v.budgetMin ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.budgetMax")} error={field("budgetMax")}>
        <input name="budgetMax" inputMode="decimal" defaultValue={v.budgetMax ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.priority")}>
        <Select name="priority" value={v.priority ?? "MEDIUM"} options={PRIORITIES.map((p) => ({ value: p, label: tp(p) }))} />
      </Field>
      {isEdit && (
        <Field label={t("f.stage")}>
          <Select name="stage" value={v.stage ?? "NEW"} options={LEAD_STAGES.map((s) => ({ value: s, label: t(`leadStage.${s}`) }))} />
        </Field>
      )}
      <Field label={t("f.followUp")}>
        <input name="nextFollowUpAt" type="datetime-local" defaultValue={dtLocal(v.nextFollowUpAt)} className="os-input" />
      </Field>
      {owners && (
        <Field label={t("f.owner")}>
          <Select name="ownerId" value={v.ownerId} empty={t("f.unassigned")} options={owners.map((o) => ({ value: o.id, label: o.label }))} />
        </Field>
      )}
      <div className="sm:col-span-2">
        <Field label={t("f.notes")}>
          <textarea name="notes" rows={3} defaultValue={v.notes ?? ""} className="os-input" />
        </Field>
      </div>
    </div>
  );
}

export function LeadCreate({ owners, autoOpen = true }: { owners: Opt[] | null; autoOpen?: boolean }) {
  const t = useTranslations("os");
  const m = useCreateModal(autoOpen ? "new" : null, (id) => `/app/crm/leads/${id}`);
  const [state, action, pending] = useActionState(async (p: Res, fd: FormData) => {
    const r = (await createLeadAction(p, fd)) as Res;
    m.done(r);
    return r;
  }, null);
  const e = useFieldErrors(state);
  return (
    <>
      <button type="button" onClick={() => m.setOpen(true)} className="os-btn-primary">
        + {t("crm.a.newLead")}
      </button>
      <Modal open={m.open} onClose={m.close} title={t("crm.a.newLead")} wide>
        <form action={action} className="grid gap-4">
          <LeadFields v={{}} owners={owners} field={e.field} isEdit={false} />
          {e.form && <p className="text-sm text-danger">{e.form}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={m.close} className="os-btn-ghost">
              {t("common.cancel")}
            </button>
            <button disabled={pending} className="os-btn-primary">
              {pending ? t("common.saving") : t("common.create")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function LeadEdit({ lead, owners }: { lead: LeadValues; owners: Opt[] | null }) {
  const t = useTranslations("os");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (p: Res, fd: FormData) => {
    const r = (await updateLeadAction(p, fd)) as Res;
    if (r?.ok) {
      setOpen(false);
      router.refresh();
    }
    return r;
  }, null);
  const e = useFieldErrors(state);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="os-btn-secondary">
        <Icon name="Pencil" size={14} /> {t("crm.a.edit")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("crm.a.edit")} wide>
        <form action={action} className="grid gap-4">
          <LeadFields v={lead} owners={owners} field={e.field} isEdit />
          {e.form && <p className="text-sm text-danger">{e.form}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="os-btn-ghost">
              {t("common.cancel")}
            </button>
            <button disabled={pending} className="os-btn-primary">
              {pending ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Convert lead
// ---------------------------------------------------------------------------

export function ConvertLead({ lead, stages, owners }: { lead: { id: string; name: string; companyName: string | null; budgetMax: string | null; budgetMin: string | null; ownerId: string | null }; stages: Opt[]; owners: Opt[] | null }) {
  const t = useTranslations("os");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [clients, setClients] = useState<Opt[] | null>(null);
  const [state, action, pending] = useActionState(async (p: Res, fd: FormData) => {
    const r = (await convertLeadAction(p, fd)) as ActionResult<{ opportunityId: string }>;
    if (r.ok && r.data) {
      setOpen(false);
      router.push(`/app/crm/opportunities/${r.data.opportunityId}`);
    }
    return r as Res;
  }, null);
  const e = useFieldErrors(state);
  useEffect(() => {
    if (!open || mode !== "existing" || clients) return;
    void clientOptionsAction().then((r) => r.ok && r.data && setClients(r.data.map((c) => ({ id: c.id, label: c.label }))));
  }, [open, mode, clients]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="os-btn-primary">
        <Icon name="ArrowRight" size={14} className="rtl:rotate-180" /> {t("crm.a.convert")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("crm.convert.title")} wide>
        <form action={action} className="grid gap-5">
          <input type="hidden" name="leadId" value={lead.id} />
          <p className="rounded-md border border-os-line bg-os-panel px-3 py-2 text-xs text-os-muted">{t("crm.convert.intro")}</p>
          <fieldset className="grid gap-3">
            <legend className="os-label">{t("crm.f.client")}</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {(["new", "existing"] as const).map((m) => (
                <label key={m} className="flex items-center gap-2">
                  <input type="radio" name="clientMode" value={m} checked={mode === m} onChange={() => setMode(m)} className="accent-[#624de3]" />
                  {t(m === "new" ? "crm.convert.clientNew" : "crm.convert.clientExisting")}
                </label>
              ))}
            </div>
            {mode === "new" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("crm.f.displayName")}>
                  <input name="clientName" defaultValue={lead.companyName ?? lead.name} className="os-input" />
                </Field>
                <Field label={t("crm.f.type")}>
                  <select name="clientType" defaultValue={lead.companyName ? "COMPANY" : "INDIVIDUAL"} className="os-input">
                    <option value="COMPANY">{t("crm.clientType.COMPANY")}</option>
                    <option value="INDIVIDUAL">{t("crm.clientType.INDIVIDUAL")}</option>
                  </select>
                </Field>
              </div>
            ) : (
              <Field label={t("crm.convert.pickClient")}>
                <select name="clientId" required className="os-input" defaultValue="">
                  <option value="" disabled>
                    {clients ? "—" : t("common.loading")}
                  </option>
                  {clients?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <label className="flex items-center gap-2 text-sm">
              {/* unchecked → "none" (the hidden field comes first; a checked box overrides it) */}
              <input type="hidden" name="contactMode" value="none" />
              <input type="checkbox" name="contactMode" value="new" defaultChecked className="accent-[#624de3]" />
              {t("crm.convert.contactNew")}
            </label>
          </fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="os-label sm:col-span-2">{t("crm.convert.oppSection")}</legend>
            <Field label={t("crm.f.title")}>
              <input name="title" placeholder="—" className="os-input" />
            </Field>
            <Field label={t("crm.f.value")} error={e.field("estimatedValue")}>
              <input name="estimatedValue" inputMode="decimal" defaultValue={lead.budgetMax ?? lead.budgetMin ?? ""} dir="ltr" className="os-input" />
            </Field>
            <Field label={t("crm.f.stage")}>
              <select name="stageId" className="os-input" defaultValue="">
                <option value="">—</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("crm.f.expectedClose")}>
              <input name="expectedCloseDate" type="date" className="os-input" />
            </Field>
            {owners && (
              <Field label={t("crm.f.owner")}>
                <select name="ownerId" defaultValue={lead.ownerId ?? ""} className="os-input">
                  <option value="">—</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </fieldset>
          {e.form && <p className="text-sm text-danger">{e.form}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="os-btn-ghost">
              {t("common.cancel")}
            </button>
            <button disabled={pending} className="os-btn-primary">
              {pending ? t("common.saving") : t("crm.convert.submit")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

type ClientValues = Partial<Record<"id" | "displayName" | "companyName" | "nameAr" | "nameEn" | "email" | "phone" | "whatsapp" | "website" | "city" | "address" | "industry" | "taxNumber" | "commercialRegistration" | "notes" | "type" | "status" | "ownerId", string | null>>;

function ClientFields({ v, field, owners, isEdit }: { v: ClientValues; field: (k: string) => string | undefined; owners: Opt[] | null; isEdit: boolean }) {
  const t = useTranslations("os.crm");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <Field label={t("f.displayName")} error={field("displayName")}>
        <input name="displayName" defaultValue={v.displayName ?? ""} required className="os-input" />
      </Field>
      <Field label={t("f.type")}>
        <select name="type" defaultValue={v.type ?? "COMPANY"} className="os-input">
          <option value="COMPANY">{t("clientType.COMPANY")}</option>
          <option value="INDIVIDUAL">{t("clientType.INDIVIDUAL")}</option>
        </select>
      </Field>
      <Field label={t("f.nameAr")}>
        <input name="nameAr" defaultValue={v.nameAr ?? ""} className="os-input" />
      </Field>
      <Field label={t("f.nameEn")}>
        <input name="nameEn" defaultValue={v.nameEn ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.email")} error={field("email")}>
        <input name="email" type="email" defaultValue={v.email ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.phone")} error={field("phone")}>
        <input name="phone" defaultValue={v.phone ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.whatsapp")} error={field("whatsapp")}>
        <input name="whatsapp" defaultValue={v.whatsapp ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.website")} error={field("website")}>
        <input name="website" defaultValue={v.website ?? ""} dir="ltr" placeholder="https://" className="os-input" />
      </Field>
      <Field label={t("f.city")}>
        <input name="city" defaultValue={v.city ?? ""} className="os-input" />
      </Field>
      <Field label={t("f.industry")}>
        <input name="industry" defaultValue={v.industry ?? ""} className="os-input" />
      </Field>
      <Field label={t("f.taxNumber")} error={field("taxNumber")}>
        <input name="taxNumber" defaultValue={v.taxNumber ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.cr")}>
        <input name="commercialRegistration" defaultValue={v.commercialRegistration ?? ""} dir="ltr" className="os-input" />
      </Field>
      {isEdit && (
        <Field label={t("f.status")}>
          <select name="status" defaultValue={v.status ?? "PROSPECT"} className="os-input">
            {(["PROSPECT", "ACTIVE", "INACTIVE"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`clientStatus.${s}`)}
              </option>
            ))}
          </select>
        </Field>
      )}
      {owners && (
        <Field label={t("f.owner")}>
          <Select name="ownerId" value={v.ownerId} options={owners.map((o) => ({ value: o.id, label: o.label }))} />
        </Field>
      )}
      <div className="sm:col-span-2">
        <Field label={t("f.address")}>
          <input name="address" defaultValue={v.address ?? ""} className="os-input" />
        </Field>
      </div>
    </div>
  );
}

export function ClientCreate({ owners }: { owners: Opt[] | null }) {
  const t = useTranslations("os");
  const m = useCreateModal("new", (id) => `/app/crm/clients/${id}`);
  const [state, action, pending] = useActionState(async (p: Res, fd: FormData) => {
    const r = (await createClientAction(p, fd)) as Res;
    m.done(r);
    return r;
  }, null);
  const e = useFieldErrors(state);
  return (
    <>
      <button type="button" onClick={() => m.setOpen(true)} className="os-btn-primary">
        + {t("crm.a.newClient")}
      </button>
      <Modal open={m.open} onClose={m.close} title={t("crm.a.newClient")} wide>
        <form action={action} className="grid gap-4">
          <ClientFields v={{}} field={e.field} owners={owners} isEdit={false} />
          {e.form && <p className="text-sm text-danger">{e.form}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={m.close} className="os-btn-ghost">
              {t("common.cancel")}
            </button>
            <button disabled={pending} className="os-btn-primary">
              {t("common.create")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ClientEdit({ client, owners }: { client: ClientValues; owners: Opt[] | null }) {
  const t = useTranslations("os");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (p: Res, fd: FormData) => {
    const r = (await updateClientAction(p, fd)) as Res;
    if (r?.ok) {
      setOpen(false);
      router.refresh();
    }
    return r;
  }, null);
  const e = useFieldErrors(state);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="os-btn-secondary">
        <Icon name="Pencil" size={14} /> {t("crm.a.edit")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("crm.a.edit")} wide>
        <form action={action} className="grid gap-4">
          <ClientFields v={client} field={e.field} owners={owners} isEdit />
          {e.form && <p className="text-sm text-danger">{e.form}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="os-btn-ghost">
              {t("common.cancel")}
            </button>
            <button disabled={pending} className="os-btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

type ContactValues = Partial<{ id: string; clientId: string | null; firstName: string; lastName: string | null; jobTitle: string | null; email: string | null; phone: string | null; whatsapp: string | null; isPrimary: boolean; preferredLanguage: string; notes: string | null }>;

export function ContactForm({ contact, clients, fixedClientId, trigger }: { contact?: ContactValues; clients?: Opt[]; fixedClientId?: string; trigger: "new" | "edit" | "newAuto" }) {
  const t = useTranslations("os");
  const router = useRouter();
  const m = useCreateModal(trigger === "newAuto" ? "new" : null, () => "");
  const [state, action, pending] = useActionState(async (p: Res, fd: FormData) => {
    const r = (contact?.id ? await updateContactAction(p, fd) : await createContactAction(p, fd)) as Res;
    if (r?.ok) {
      m.close();
      router.refresh();
    }
    return r;
  }, null);
  const e = useFieldErrors(state);
  const v = contact ?? {};
  return (
    <>
      <button type="button" onClick={() => m.setOpen(true)} className={trigger === "edit" ? "os-btn-ghost h-8 px-2 text-xs" : "os-btn-primary"}>
        {trigger === "edit" ? <Icon name="Pencil" size={13} /> : `+ ${t("crm.a.newContact")}`}
      </button>
      <Modal open={m.open} onClose={m.close} title={trigger === "edit" ? t("crm.a.edit") : t("crm.a.newContact")} wide>
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          {v.id && <input type="hidden" name="id" value={v.id} />}
          {fixedClientId ? (
            <input type="hidden" name="clientId" value={fixedClientId} />
          ) : (
            <div className="sm:col-span-2">
              <Field label={t("crm.f.client")}>
                <Select name="clientId" value={v.clientId} empty={t("crm.contacts.noClient")} options={(clients ?? []).map((c) => ({ value: c.id, label: c.label }))} />
              </Field>
            </div>
          )}
          <Field label={t("crm.f.firstName")} error={e.field("firstName")}>
            <input name="firstName" defaultValue={v.firstName} required className="os-input" />
          </Field>
          <Field label={t("crm.f.lastName")}>
            <input name="lastName" defaultValue={v.lastName ?? ""} className="os-input" />
          </Field>
          <Field label={t("crm.f.jobTitle")}>
            <input name="jobTitle" defaultValue={v.jobTitle ?? ""} className="os-input" />
          </Field>
          <Field label={t("crm.f.email")} error={e.field("email")}>
            <input name="email" type="email" defaultValue={v.email ?? ""} dir="ltr" className="os-input" />
          </Field>
          <Field label={t("crm.f.phone")} error={e.field("phone")}>
            <input name="phone" defaultValue={v.phone ?? ""} dir="ltr" className="os-input" />
          </Field>
          <Field label={t("crm.f.whatsapp")} error={e.field("whatsapp")}>
            <input name="whatsapp" defaultValue={v.whatsapp ?? ""} dir="ltr" className="os-input" />
          </Field>
          <Field label={t("crm.f.language")}>
            <select name="preferredLanguage" defaultValue={v.preferredLanguage ?? "ar"} className="os-input">
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="isPrimary" value="true" defaultChecked={v.isPrimary} className="accent-[#624de3]" />
            {t("crm.f.primary")}
          </label>
          {e.form && <p className="text-sm text-danger sm:col-span-2">{e.form}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={m.close} className="os-btn-ghost">
              {t("common.cancel")}
            </button>
            <button disabled={pending} className="os-btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Opportunity
// ---------------------------------------------------------------------------

type OppValues = Partial<{ id: string; title: string; description: string | null; serviceCategory: string | null; serviceId: string | null; estimatedValue: string; currency: string; probability: number; primaryContactId: string | null; ownerId: string | null; expectedCloseDate: Date | string | null; nextFollowUpAt: Date | string | null }>;

export function OpportunityForm({ opp, owners, fixedClientId, contacts, trigger, stages }: { opp?: OppValues; owners: Opt[] | null; fixedClientId?: string; contacts?: Opt[]; trigger: "new" | "edit" | "newAuto"; stages?: Opt[] }) {
  const t = useTranslations("os");
  const locale = useLocale();
  const router = useRouter();
  const m = useCreateModal(trigger === "newAuto" ? "new" : null, (id) => `/app/crm/opportunities/${id}`);
  const [clients, setClients] = useState<{ id: string; label: string; contacts: (Opt & { isPrimary: boolean })[] }[] | null>(null);
  const [clientId, setClientId] = useState(fixedClientId ?? "");
  const [, start] = useTransition();
  useEffect(() => {
    if (!m.open || fixedClientId || clients || opp?.id) return;
    start(async () => {
      const r = await clientOptionsAction();
      if (r.ok && r.data) setClients(r.data);
    });
  }, [m.open, fixedClientId, clients, opp?.id]);
  const [state, action, pending] = useActionState(async (p: Res, fd: FormData) => {
    const r = (opp?.id ? await updateOpportunityAction(p, fd) : await createOpportunityAction(p, fd)) as Res;
    if (r?.ok) {
      if (opp?.id) {
        m.close();
        router.refresh();
      } else m.done(r);
    }
    return r;
  }, null);
  const e = useFieldErrors(state);
  const v = opp ?? {};
  const contactOpts = contacts ?? clients?.find((c) => c.id === clientId)?.contacts ?? [];
  return (
    <>
      <button type="button" onClick={() => m.setOpen(true)} className={trigger === "edit" ? "os-btn-secondary" : "os-btn-primary"}>
        {trigger === "edit" ? (
          <>
            <Icon name="Pencil" size={14} /> {t("crm.a.edit")}
          </>
        ) : (
          `+ ${t("crm.a.newOpportunity")}`
        )}
      </button>
      <Modal open={m.open} onClose={m.close} title={trigger === "edit" ? t("crm.a.edit") : t("crm.a.newOpportunity")} wide>
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          {v.id && <input type="hidden" name="id" value={v.id} />}
          {!v.id &&
            (fixedClientId ? (
              <input type="hidden" name="clientId" value={fixedClientId} />
            ) : (
              <div className="sm:col-span-2">
                <Field label={t("crm.f.client")} error={e.field("clientId")}>
                  <select name="clientId" required value={clientId} onChange={(ev) => setClientId(ev.target.value)} className="os-input">
                    <option value="" disabled>
                      {clients ? "—" : t("common.loading")}
                    </option>
                    {clients?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ))}
          <div className="sm:col-span-2">
            <Field label={t("crm.f.title")} error={e.field("title")}>
              <input name="title" defaultValue={v.title} required className="os-input" />
            </Field>
          </div>
          <Field label={t("crm.f.service")}>
            <ServiceSelect value={v.serviceId} />
          </Field>
          <Field label={t("crm.f.value")} error={e.field("estimatedValue")}>
            <input name="estimatedValue" inputMode="decimal" defaultValue={v.estimatedValue ?? ""} dir="ltr" className="os-input" />
          </Field>
          {v.id && (
            <Field label={`${t("crm.f.probability")} %`} error={e.field("probability")}>
              <input name="probability" type="number" min={0} max={100} defaultValue={v.probability} dir="ltr" className="os-input" />
            </Field>
          )}
          {!v.id && stages && (
            <Field label={t("crm.f.stage")}>
              <Select name="stageId" empty="—" options={stages.map((s) => ({ value: s.id, label: s.label }))} />
            </Field>
          )}
          <Field label={t("crm.f.contact")}>
            <Select name="primaryContactId" value={v.primaryContactId} empty="—" options={contactOpts.map((c) => ({ value: c.id, label: c.label }))} />
          </Field>
          <Field label={t("crm.f.expectedClose")}>
            <input name="expectedCloseDate" type="date" defaultValue={dateOnly(v.expectedCloseDate)} className="os-input" />
          </Field>
          <Field label={t("crm.f.followUp")}>
            <input name="nextFollowUpAt" type="datetime-local" defaultValue={dtLocal(v.nextFollowUpAt)} className="os-input" />
          </Field>
          {owners && (
            <Field label={t("crm.f.owner")}>
              <Select name="ownerId" value={v.ownerId} options={owners.map((o) => ({ value: o.id, label: o.label }))} />
            </Field>
          )}
          <div className="sm:col-span-2">
            <Field label={t("crm.f.description")}>
              <textarea name="description" rows={3} defaultValue={v.description ?? ""} className="os-input" />
            </Field>
          </div>
          {e.form && <p className="text-sm text-danger sm:col-span-2">{e.form}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={m.close} className="os-btn-ghost">
              {t("common.cancel")}
            </button>
            <button disabled={pending} className="os-btn-primary">
              {pending ? t("common.saving") : v.id ? t("common.save") : t("common.create")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Small shared dialogs
// ---------------------------------------------------------------------------

/** Ask for a lost reason (required) before running `onConfirm`. */
export function LostReasonDialog({ open, onClose, onConfirm, pending, error }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void; pending?: boolean; error?: string }) {
  const t = useTranslations("os");
  const [reason, setReason] = useState("");
  return (
    <Modal open={open} onClose={onClose} title={t("crm.lost.title")}>
      <div className="grid gap-3">
        <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder={t("crm.lost.placeholder")} className="os-input" />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="os-btn-ghost">
            {t("common.cancel")}
          </button>
          <button type="button" disabled={pending || reason.trim().length < 3} onClick={() => onConfirm(reason.trim())} className="os-btn-danger">
            {t("crm.a.confirm")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Quick follow-up scheduling (works well on mobile): presets + datetime input. */
export function FollowUpPicker({ value, onSave }: { value: Date | string | null; onSave: (iso: string | null) => Promise<ActionResult<unknown>> }) {
  const t = useTranslations("os.crm.a");
  const router = useRouter();
  const err = useErrorText();
  const [v, setV] = useState(dtLocal(value));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const save = (local: string | null) =>
    start(async () => {
      const r = await onSave(local ? new Date(local).toISOString() : null);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  const preset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    const s = dtLocal(d);
    setV(s);
    save(s);
  };
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={pending} onClick={() => preset(0)} className="os-btn-secondary h-8 px-2.5 text-xs">
          {t("today")}
        </button>
        <button type="button" disabled={pending} onClick={() => preset(1)} className="os-btn-secondary h-8 px-2.5 text-xs">
          {t("tomorrow")}
        </button>
        <button type="button" disabled={pending} onClick={() => preset(7)} className="os-btn-secondary h-8 px-2.5 text-xs">
          {t("nextWeek")}
        </button>
        {value && (
          <button type="button" disabled={pending} onClick={() => (setV(""), save(null))} className="os-btn-ghost h-8 px-2.5 text-xs">
            {t("clear")}
          </button>
        )}
      </div>
      <div className="flex gap-1.5">
        <input type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} className="os-input" />
        <button type="button" disabled={pending || !v} onClick={() => save(v)} className="os-btn-primary px-3">
          {t("save")}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{err(error)}</p>}
    </div>
  );
}
