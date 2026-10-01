"use server";

import "@/server";
import { archiveLead, convertLead, createLead, markLeadLost, qualifyLead, reopenLead, setLeadFollowUp, updateLead } from "@/server/crm/leads";
import { archiveOpportunity, createOpportunity, markOpportunityLost, markOpportunityWon, moveOpportunityStage, updateOpportunity } from "@/server/crm/opportunities";
import { archiveClient, clientOptions, createClient, createContact, updateClient, updateContact } from "@/server/crm/clients";
import { addNote, deleteNote, logActivity, setTags, updateNote } from "@/server/crm/activities";
import { deleteView, saveView } from "@/server/crm/views";
import { serviceChoices } from "@/server/commercial/catalog";
import { formToObject, runAction } from "./action";

/** Thin adapters: every action resolves the session (runAction) and the service re-checks permissions. */

// Leads
export const createLeadAction = async (_: unknown, fd: FormData) => runAction(async (ctx) => ({ id: (await createLead(ctx, formToObject(fd))).id }));
export const updateLeadAction = async (_: unknown, fd: FormData) => runAction(async (ctx) => void (await updateLead(ctx, formToObject(fd))));
export const qualifyLeadAction = async (id: string) => runAction(async (ctx) => void (await qualifyLead(ctx, id)));
export const markLeadLostAction = async (id: string, reason: string) => runAction(async (ctx) => void (await markLeadLost(ctx, id, reason)));
export const reopenLeadAction = async (id: string) => runAction(async (ctx) => void (await reopenLead(ctx, id)));
export const archiveLeadAction = async (id: string) => runAction(async (ctx) => void (await archiveLead(ctx, id)));
export const setLeadFollowUpAction = async (id: string, at: string | null) => runAction(async (ctx) => void (await setLeadFollowUp(ctx, id, at ? new Date(at) : null)));
export const convertLeadAction = async (_: unknown, fd: FormData) => runAction((ctx) => convertLead(ctx, formToObject(fd)));

// Opportunities
export const createOpportunityAction = async (_: unknown, fd: FormData) => runAction(async (ctx) => ({ id: (await createOpportunity(ctx, formToObject(fd))).id }));
export const updateOpportunityAction = async (_: unknown, fd: FormData) => runAction(async (ctx) => void (await updateOpportunity(ctx, formToObject(fd))));
export const moveStageAction = async (id: string, stageId: string, lostReason?: string) => runAction(async (ctx) => void (await moveOpportunityStage(ctx, { id, stageId, lostReason })));
export const markWonAction = async (id: string) => runAction(async (ctx) => void (await markOpportunityWon(ctx, id)));
export const markOppLostAction = async (id: string, reason: string) => runAction(async (ctx) => void (await markOpportunityLost(ctx, id, reason)));
export const archiveOpportunityAction = async (id: string) => runAction(async (ctx) => void (await archiveOpportunity(ctx, id)));
export const setOppFollowUpAction = async (id: string, at: string | null) => runAction(async (ctx) => void (await updateOpportunity(ctx, { id, nextFollowUpAt: at ? new Date(at) : null })));

// Clients & contacts
export const createClientAction = async (_: unknown, fd: FormData) => runAction(async (ctx) => ({ id: (await createClient(ctx, formToObject(fd))).id }));
export const updateClientAction = async (_: unknown, fd: FormData) => runAction(async (ctx) => void (await updateClient(ctx, formToObject(fd))));
export const archiveClientAction = async (id: string) => runAction(async (ctx) => void (await archiveClient(ctx, id)));
export const createContactAction = async (_: unknown, fd: FormData) => runAction(async (ctx) => ({ id: (await createContact(ctx, formToObject(fd))).id }));
export const updateContactAction = async (_: unknown, fd: FormData) => runAction(async (ctx) => void (await updateContact(ctx, formToObject(fd))));
/** Active catalog services (id + names) for CRM forms — Phase 3 catalog replaces the static category list. */
export const serviceChoicesAction = async () =>
  runAction(async (ctx) => (await serviceChoices(ctx)).map((s) => ({ id: s.id, nameAr: s.nameAr, nameEn: s.nameEn, category: s.category })), { revalidate: false });
export const clientOptionsAction = async (q?: string) =>
  runAction(async (ctx) => (await clientOptions(ctx, q)).map((c) => ({ id: c.id, label: `${c.displayName} · ${c.number}`, contacts: c.contacts.map((x) => ({ id: x.id, label: `${x.firstName} ${x.lastName ?? ""}`.trim(), isPrimary: x.isPrimary })) })), { revalidate: false });

// Timeline
export const logActivityAction = async (_: unknown, fd: FormData) => runAction(async (ctx) => void (await logActivity(ctx, formToObject(fd))));
export const addNoteAction = async (_: unknown, fd: FormData) => runAction(async (ctx) => void (await addNote(ctx, formToObject(fd))));
export const updateNoteAction = async (id: string, body: string) => runAction(async (ctx) => void (await updateNote(ctx, id, body)));
export const deleteNoteAction = async (id: string) => runAction(async (ctx) => void (await deleteNote(ctx, id)));
export const setTagsAction = async (entityType: "LEAD" | "CLIENT" | "OPPORTUNITY", id: string, tags: string[]) => runAction(async (ctx) => void (await setTags(ctx, entityType, id, tags)));

// Saved views
export const saveViewAction = async (module: "leads" | "opportunities" | "clients", name: string, query: string) => runAction(async (ctx) => void (await saveView(ctx, { module, name, query })));
export const deleteViewAction = async (id: string) => runAction(async (ctx) => void (await deleteView(ctx, id)));
