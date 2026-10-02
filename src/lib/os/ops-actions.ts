"use server";

import "@/server";
import { cancelRequest, createRequest, saveRule, submitRequest, updateRequest, withdrawRequest } from "@/server/ops/procurement";
import { cancelOrder, closeOrder, createOrder, createOrderFromRequest, issueOrder, receiveOrder, reviseOrder, submitOrder, updateOrder, withdrawOrder } from "@/server/ops/orders";
import { addVendorContact, removeVendorContact, updateVendorOps } from "@/server/ops/vendors";
import { assignAsset, cancelMaintenance, changeAssetStatus, completeMaintenance, createAsset, createAssetFromPoItem, createMaintenance, returnAsset, saveAssetCategory, startMaintenance, updateAsset } from "@/server/ops/assets";
import { approveDocumentReview, archiveDocument, updateDocumentMeta } from "@/server/ops/documents";
import { addTicketComment, assignTicket, changeTicketPriority, changeTicketStatus, createTicket, saveSlaPolicy, updateTicketMeta } from "@/server/ops/support";
import { archiveArticle, createArticle, publishArticle, returnArticle, submitArticleForReview, updateArticle } from "@/server/ops/knowledge";
import { createExpense } from "@/server/finance/expenses";
import { runAction } from "./action";

/** Thin adapters — every operations service re-checks permission, scope and state on the server. */
type R = Record<string, unknown>;

// procurement
export const createRequestAction = async (input: R) => runAction(async (ctx) => ({ id: (await createRequest(ctx, input)).id }));
export const updateRequestAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateRequest(ctx, id, input)));
export const submitRequestAction = async (id: string) => runAction(async (ctx) => void (await submitRequest(ctx, id)));
export const withdrawRequestAction = async (id: string) => runAction(async (ctx) => void (await withdrawRequest(ctx, id)));
export const cancelRequestAction = async (id: string, input: R) => runAction(async (ctx) => void (await cancelRequest(ctx, id, input)));
export const saveRuleAction = async (input: R) => runAction(async (ctx) => void (await saveRule(ctx, input)));

// purchase orders
export const createOrderAction = async (input: R) => runAction(async (ctx) => ({ id: (await createOrder(ctx, input)).id }));
export const createOrderFromRequestAction = async (requestId: string, input: R) => runAction(async (ctx) => ({ id: (await createOrderFromRequest(ctx, requestId, input)).id }));
export const updateOrderAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateOrder(ctx, id, input)));
export const submitOrderAction = async (id: string) => runAction(async (ctx) => void (await submitOrder(ctx, id)));
export const withdrawOrderAction = async (id: string) => runAction(async (ctx) => void (await withdrawOrder(ctx, id)));
export const issueOrderAction = async (id: string) => runAction(async (ctx) => void (await issueOrder(ctx, id)));
export const receiveOrderAction = async (id: string, input: R) => runAction(async (ctx) => void (await receiveOrder(ctx, id, input)));
export const cancelOrderAction = async (id: string, input: R) => runAction(async (ctx) => void (await cancelOrder(ctx, id, input)));
export const reviseOrderAction = async (id: string, input: R) => runAction(async (ctx) => ({ id: (await reviseOrder(ctx, id, input)).id }));
export const closeOrderAction = async (id: string, input: R) => runAction(async (ctx) => void (await closeOrder(ctx, id, input)));
/** supplier expense linked to a PO (Phase 5 expense flow — submitted for approval like any other expense) */
export const poExpenseAction = async (input: R) => runAction(async (ctx) => ({ id: (await createExpense(ctx, input)).id }));

// vendors
export const vendorOpsAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateVendorOps(ctx, id, input)));
export const vendorContactAction = async (id: string, input: R) => runAction(async (ctx) => void (await addVendorContact(ctx, id, input)));
export const removeVendorContactAction = async (id: string) => runAction(async (ctx) => void (await removeVendorContact(ctx, id)));

// assets
export const createAssetAction = async (input: R) => runAction(async (ctx) => ({ id: (await createAsset(ctx, input)).id }));
export const assetFromPoItemAction = async (poItemId: string, input: R) => runAction(async (ctx) => ({ id: (await createAssetFromPoItem(ctx, poItemId, input)).id }));
export const updateAssetAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateAsset(ctx, id, input)));
export const assignAssetAction = async (id: string, input: R) => runAction(async (ctx) => void (await assignAsset(ctx, id, input)));
export const returnAssetAction = async (id: string, input: R) => runAction(async (ctx) => void (await returnAsset(ctx, id, input)));
export const assetStatusAction = async (id: string, input: R) => runAction(async (ctx) => void (await changeAssetStatus(ctx, id, input)));
export const createMaintenanceAction = async (assetId: string, input: R) => runAction(async (ctx) => void (await createMaintenance(ctx, assetId, input)));
export const startMaintenanceAction = async (id: string) => runAction(async (ctx) => void (await startMaintenance(ctx, id)));
export const completeMaintenanceAction = async (id: string, input: R) => runAction(async (ctx) => void (await completeMaintenance(ctx, id, input)));
export const cancelMaintenanceAction = async (id: string) => runAction(async (ctx) => void (await cancelMaintenance(ctx, id)));
export const saveAssetCategoryAction = async (input: R) => runAction(async (ctx) => void (await saveAssetCategory(ctx, input)));

// documents (uploads go through the multipart route handlers, not server actions)
export const archiveDocumentAction = async (id: string, input: R) => runAction(async (ctx) => void (await archiveDocument(ctx, id, input)));
export const documentMetaAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateDocumentMeta(ctx, id, input)));
export const approveDocumentAction = async (id: string) => runAction(async (ctx) => void (await approveDocumentReview(ctx, id)));

// support
export const createTicketAction = async (input: R) => runAction(async (ctx) => ({ id: (await createTicket(ctx, input)).id }));
export const assignTicketAction = async (id: string, input: R) => runAction(async (ctx) => void (await assignTicket(ctx, id, input)));
export const ticketStatusAction = async (id: string, input: R) => runAction(async (ctx) => void (await changeTicketStatus(ctx, id, input)));
export const ticketPriorityAction = async (id: string, input: R) => runAction(async (ctx) => void (await changeTicketPriority(ctx, id, input)));
export const ticketMetaAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateTicketMeta(ctx, id, input)));
export const ticketCommentAction = async (id: string, input: R) => runAction(async (ctx) => void (await addTicketComment(ctx, id, input)));
export const saveSlaAction = async (input: R) => runAction(async (ctx) => void (await saveSlaPolicy(ctx, input)));

// knowledge
export const createArticleAction = async (input: R) => runAction(async (ctx) => ({ id: (await createArticle(ctx, input)).id }));
export const updateArticleAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateArticle(ctx, id, input)));
export const submitArticleAction = async (id: string) => runAction(async (ctx) => void (await submitArticleForReview(ctx, id)));
export const returnArticleAction = async (id: string, input: R) => runAction(async (ctx) => void (await returnArticle(ctx, id, input)));
export const publishArticleAction = async (id: string) => runAction(async (ctx) => void (await publishArticle(ctx, id)));
export const archiveArticleAction = async (id: string) => runAction(async (ctx) => void (await archiveArticle(ctx, id)));
