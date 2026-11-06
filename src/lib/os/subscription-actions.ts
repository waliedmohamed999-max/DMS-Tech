"use server";

import "@/server";
import { addSubscriptionNote, cancelSubscription, changePlan, createSubscription, pauseSubscription, resumeSubscription, revokeCancellation, startBilling, updateTerms } from "@/server/subscriptions/subscriptions";
import { runAction } from "./action";

/** Thin adapters — the service re-checks permission and state on every call. */
type R = Record<string, unknown>;

export const createSubscriptionAction = async (input: R) => runAction(async (ctx) => ({ id: (await createSubscription(ctx, input)).id }));
export const changePlanAction = async (id: string, input: R) => runAction(async (ctx) => void (await changePlan(ctx, id, input)));
export const updateTermsAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateTerms(ctx, id, input)));
export const pauseSubscriptionAction = async (id: string, input: R) => runAction(async (ctx) => void (await pauseSubscription(ctx, id, input)));
export const resumeSubscriptionAction = async (id: string) => runAction(async (ctx) => void (await resumeSubscription(ctx, id)));
export const cancelSubscriptionAction = async (id: string, input: R) => runAction(async (ctx) => ({ early: (await cancelSubscription(ctx, id, input)).early }));
export const revokeCancellationAction = async (id: string) => runAction(async (ctx) => void (await revokeCancellation(ctx, id)));
export const startBillingAction = async (id: string, input: R) => runAction(async (ctx) => void (await startBilling(ctx, id, input)));
export const subscriptionNoteAction = async (id: string, input: R) => runAction(async (ctx) => void (await addSubscriptionNote(ctx, id, input)));
