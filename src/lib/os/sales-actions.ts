"use server";

import "@/server";
import { archiveService, createPackage, createService, updatePackage, updateService } from "@/server/commercial/catalog";
import {
  acceptQuotation,
  cancelQuotation,
  createQuotation,
  createRevision,
  duplicateQuotation,
  markQuotationSent,
  markQuotationViewed,
  rejectQuotationByClient,
  reopenQuotation,
  requestInternalReview,
  submitQuotation,
  updateQuotationDraft,
  withdrawSubmission,
  opportunityOptions,
  type QuoteDraftInput
} from "@/server/commercial/quotations";
import {
  activateContract,
  cancelContract,
  createContractFromQuotation,
  requestContractReview,
  returnContractToDraft,
  sendContractForSignature,
  setMilestoneStatus,
  terminateContract,
  updateContract
} from "@/server/commercial/contracts";
import { formToObject, runAction } from "./action";

/** Thin adapters — every service re-checks permission, scope and state. */

// Catalog
export const createServiceAction = async (_: unknown, fd: FormData) => runAction(async (ctx) => ({ id: (await createService(ctx, formToObject(fd))).id }));
export const updateServiceAction = async (_: unknown, fd: FormData) => runAction(async (ctx) => ({ id: (await updateService(ctx, formToObject(fd))).id }));
export const archiveServiceAction = async (id: string) => runAction(async (ctx) => void (await archiveService(ctx, id)));
export const savePackageAction = async (input: Record<string, unknown>) =>
  runAction(async (ctx) => ({ id: (input.id ? await updatePackage(ctx, input) : await createPackage(ctx, input)).id }));

// Quotations
export const saveQuotationAction = async (id: string | null, input: QuoteDraftInput) =>
  runAction(async (ctx) => (id ? (await updateQuotationDraft(ctx, id, input), { id }) : { id: (await createQuotation(ctx, input)).id }));
export const submitQuotationAction = async (id: string) => runAction((ctx) => submitQuotation(ctx, id));
export const withdrawQuotationAction = async (id: string) => runAction(async (ctx) => void (await withdrawSubmission(ctx, id)));
export const reviewQuotationAction = async (id: string) => runAction(async (ctx) => void (await requestInternalReview(ctx, id)));
export const reopenQuotationAction = async (id: string) => runAction(async (ctx) => void (await reopenQuotation(ctx, id)));
export const sendQuotationAction = async (id: string, method: string, note: string) => runAction(async (ctx) => void (await markQuotationSent(ctx, id, { method, note, confirm: true })));
export const viewedQuotationAction = async (id: string) => runAction(async (ctx) => void (await markQuotationViewed(ctx, id)));
export const acceptQuotationAction = async (id: string, versionId: string, note: string, markOpportunityWon: boolean) =>
  runAction((ctx) => acceptQuotation(ctx, id, { versionId, note, markOpportunityWon, confirm: true }));
export const rejectQuotationAction = async (id: string, reason: string) => runAction(async (ctx) => void (await rejectQuotationByClient(ctx, id, { reason })));
export const cancelQuotationAction = async (id: string, reason: string) => runAction(async (ctx) => void (await cancelQuotation(ctx, id, { reason })));
export const reviseQuotationAction = async (id: string) => runAction(async (ctx) => (await createRevision(ctx, id), { id }));
export const duplicateQuotationAction = async (id: string) => runAction(async (ctx) => ({ id: (await duplicateQuotation(ctx, id)).id }));

export const opportunityOptionsAction = async (clientId: string) =>
  runAction(async (ctx) => (await opportunityOptions(ctx, clientId)).map((o) => ({ id: o.id, label: `${o.number} · ${o.title}` })), { revalidate: false });

// Contracts
export const createContractAction = async (quotationId: string) => runAction(async (ctx) => ({ id: (await createContractFromQuotation(ctx, quotationId)).id }));
export const updateContractAction = async (id: string, input: Record<string, unknown>) => runAction(async (ctx) => void (await updateContract(ctx, id, input)));
export const contractTransitionAction = async (id: string, to: "review" | "draft" | "signature") =>
  runAction(async (ctx) => void (await (to === "review" ? requestContractReview(ctx, id) : to === "draft" ? returnContractToDraft(ctx, id) : sendContractForSignature(ctx, id))));
export const activateContractAction = async (id: string, signedAt: string) => runAction(async (ctx) => void (await activateContract(ctx, id, { signedAt, confirm: true })));
export const terminateContractAction = async (id: string, reason: string) => runAction(async (ctx) => void (await terminateContract(ctx, id, { reason })));
export const cancelContractAction = async (id: string, reason: string) => runAction(async (ctx) => void (await cancelContract(ctx, id, { reason })));
export const milestoneStatusAction = async (contractId: string, milestoneId: string, status: "PENDING" | "COMPLETED" | "CANCELLED") =>
  runAction(async (ctx) => void (await setMilestoneStatus(ctx, contractId, milestoneId, status)));
