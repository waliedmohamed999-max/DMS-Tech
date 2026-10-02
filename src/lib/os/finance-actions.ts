"use server";

import "@/server";
import { addCollectionNote, cancelInvoiceDraft, createInvoice, issueInvoice, markInvoiceSent, openInvoicesForClient, updateInvoiceDraft, voidInvoice } from "@/server/finance/invoices";
import { createInvoiceFromSource } from "@/server/finance/eligibility";
import { recordPayment, reversePayment } from "@/server/finance/payments";
import { cancelExpense, createExpense, createVendor, payExpense, saveCategory, setVendorArchived, submitExpense, updateExpense, updateVendor, withdrawExpense } from "@/server/finance/expenses";
import { setCostRate } from "@/server/finance/costing";
import { runAction } from "./action";

/** Thin adapters — every finance service re-checks permission, finance scope and state. */
type R = Record<string, unknown>;

// Invoices
export const createInvoiceAction = async (input: R) => runAction(async (ctx) => ({ id: (await createInvoice(ctx, input)).id }));
export const createInvoiceFromSourceAction = async (input: R) => runAction(async (ctx) => ({ id: (await createInvoiceFromSource(ctx, input)).id }));
export const updateInvoiceDraftAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateInvoiceDraft(ctx, id, input)));
export const issueInvoiceAction = async (id: string) => runAction(async (ctx) => void (await issueInvoice(ctx, id)));
export const markInvoiceSentAction = async (id: string, input: R) => runAction(async (ctx) => void (await markInvoiceSent(ctx, id, input)));
export const cancelInvoiceAction = async (id: string, reason: string) => runAction(async (ctx) => void (await cancelInvoiceDraft(ctx, id, { reason })));
export const voidInvoiceAction = async (id: string, reason: string, replace: boolean) => runAction(async (ctx) => ({ replacementId: (await voidInvoice(ctx, id, { reason, replace })).replacementId }));
export const collectionNoteAction = async (id: string, input: R) => runAction(async (ctx) => void (await addCollectionNote(ctx, id, input)));
export const openInvoicesAction = async (clientId: string) =>
  runAction(async (ctx) => (await openInvoicesForClient(ctx, clientId)).map((i) => ({ id: i.id, number: i.number, dueDate: i.dueDate.toISOString().slice(0, 10), total: i.total.toFixed(2), balance: i.balanceDue.toFixed(2), currency: i.currency, status: i.status })), { revalidate: false });

// Payments
export const recordPaymentAction = async (input: R) => runAction(async (ctx) => ({ id: (await recordPayment(ctx, input)).id }));
export const reversePaymentAction = async (id: string, reason: string) => runAction(async (ctx) => void (await reversePayment(ctx, id, { reason })));

// Expenses & vendors
export const createExpenseAction = async (input: R) => runAction(async (ctx) => ({ id: (await createExpense(ctx, input)).id }));
export const updateExpenseAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateExpense(ctx, id, input)));
export const submitExpenseAction = async (id: string) => runAction(async (ctx) => void (await submitExpense(ctx, id)));
export const withdrawExpenseAction = async (id: string) => runAction(async (ctx) => void (await withdrawExpense(ctx, id)));
export const payExpenseAction = async (id: string, input: R) => runAction(async (ctx) => void (await payExpense(ctx, id, input)));
export const cancelExpenseAction = async (id: string, reason?: string) => runAction(async (ctx) => void (await cancelExpense(ctx, id, { reason })));
export const createVendorAction = async (input: R) => runAction(async (ctx) => ({ id: (await createVendor(ctx, input)).id }));
export const updateVendorAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateVendor(ctx, id, input)));
export const archiveVendorAction = async (id: string, archived: boolean) => runAction(async (ctx) => void (await setVendorArchived(ctx, id, archived)));
export const saveCategoryAction = async (input: R) => runAction(async (ctx) => void (await saveCategory(ctx, input)));
export const setCostRateAction = async (input: R) => runAction(async (ctx) => void (await setCostRate(ctx, input)));
