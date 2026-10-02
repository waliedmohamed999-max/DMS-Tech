"use server";

import "@/server";
import { createFromTemplate, createRule, dismissExecution, retryExecution, setRuleEnabled, updateRule } from "@/server/automation/engine";
import { dismissEvent, retryEvent } from "@/server/system/events";
import { dismissOutbox, retryOutbox } from "@/server/integrations/outbox";
import { enforceLimit } from "@/server/security/limits";
import { runAction } from "./action";

/** Thin adapters — every service re-checks permission and state. Rule definitions arrive as JSON text from the builder. */
type R = Record<string, unknown>;
const parseJson = (v: unknown, fallback: unknown) => {
  if (typeof v !== "string") return v ?? fallback;
  if (!v.trim()) return fallback;
  try {
    return JSON.parse(v);
  } catch {
    return "__INVALID_JSON__";
  }
};
const ruleInput = (input: R) => ({ ...input, conditions: parseJson(input.conditions, { all: [] }), actions: parseJson(input.actions, []) });

export const createRuleAction = async (input: R) => runAction(async (ctx) => createRule(ctx, ruleInput(input)));
export const updateRuleAction = async (id: string, input: R) => runAction(async (ctx) => updateRule(ctx, id, ruleInput(input)));
export const templateRuleAction = async (key: string, locale: "ar" | "en") => runAction(async (ctx) => createFromTemplate(ctx, key, locale));
export const enableRuleAction = async (id: string, enabled: boolean) => runAction(async (ctx) => void (await setRuleEnabled(ctx, id, enabled)));
export const retryExecutionAction = async (id: string) =>
  runAction(async (ctx) => {
    await enforceLimit("operatorRetry", ctx.userId);
    return retryExecution(ctx, id);
  });
export const dismissExecutionAction = async (id: string, input: R) => runAction(async (ctx) => void (await dismissExecution(ctx, id, input)));
export const retryEventAction = async (id: string) =>
  runAction(async (ctx) => {
    await enforceLimit("operatorRetry", ctx.userId);
    return retryEvent(ctx, id);
  });
export const dismissEventAction = async (id: string, input: R) => runAction(async (ctx) => void (await dismissEvent(ctx, id, input)));
export const retryOutboxDeadAction = async (id: string) => runAction(async (ctx) => void (await retryOutbox(ctx, id)));
export const dismissOutboxDeadAction = async (id: string, input: R) => runAction(async (ctx) => void (await dismissOutbox(ctx, id, input)));
