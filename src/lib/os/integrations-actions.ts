"use server";

import "@/server";
import { configureConnection, setConnectionDisabled, testConnection } from "@/server/integrations/registry";
import { dismissOutbox, retryOutbox } from "@/server/integrations/outbox";
import { addConversationNote, createLeadFromConversation, createTicketFromConversation, linkConversation, sendReply, setConsent, syncTemplates } from "@/server/whatsapp/service";
import { addSpend, cancelCampaign, completeCampaign, createCampaign, pauseCampaign, resumeCampaign, setAudience, startCampaign, submitCampaign, updateCampaign } from "@/server/marketing/campaigns";
import { runAction } from "./action";

/** Thin adapters — every service re-checks permission, scope and state on the server. Secrets are write-only. */
type R = Record<string, unknown>;

// integrations: form fields arrive flat as cfg_<name> / sec_<name>
export const configureConnectionAction = async (id: string, input: R) =>
  runAction(async (ctx) => {
    const config: Record<string, string> = {};
    const secrets: Record<string, string> = {};
    for (const [k, v] of Object.entries(input)) {
      if (k.startsWith("cfg_")) config[k.slice(4)] = String(v ?? "");
      if (k.startsWith("sec_")) secrets[k.slice(4)] = String(v ?? "");
    }
    return configureConnection(ctx, id, { environment: input.environment || "PRODUCTION", config, secrets });
  });
export const testConnectionAction = async (id: string) => runAction(async (ctx) => testConnection(ctx, id));
export const disableConnectionAction = async (id: string, disabled: boolean) => runAction(async (ctx) => void (await setConnectionDisabled(ctx, id, disabled)));
export const retryOutboxAction = async (id: string) => runAction(async (ctx) => void (await retryOutbox(ctx, id)));
export const dismissOutboxAction = async (id: string, input: R) => runAction(async (ctx) => void (await dismissOutbox(ctx, id, input)));

// whatsapp
export const waLinkAction = async (id: string, input: R) => runAction(async (ctx) => void (await linkConversation(ctx, id, input)));
export const waLeadAction = async (id: string, input: R) => runAction(async (ctx) => createLeadFromConversation(ctx, id, input));
export const waTicketAction = async (id: string, input: R) => runAction(async (ctx) => createTicketFromConversation(ctx, id, input));
export const waNoteAction = async (id: string, input: R) => runAction(async (ctx) => void (await addConversationNote(ctx, id, input)));
export const waReplyAction = async (id: string, input: R) => runAction(async (ctx) => void (await sendReply(ctx, id, input)));
export const waSyncTemplatesAction = async () => runAction(async (ctx) => void (await syncTemplates(ctx)));
export const consentAction = async (input: R) => runAction(async (ctx) => void (await setConsent(ctx, input)));

// campaigns
export const createCampaignAction = async (input: R) => runAction(async (ctx) => createCampaign(ctx, input));
export const updateCampaignAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateCampaign(ctx, id, input)));
export const audienceAction = async (id: string, input: R) => runAction(async (ctx) => void (await setAudience(ctx, id, input)));
export const submitCampaignAction = async (id: string) => runAction(async (ctx) => void (await submitCampaign(ctx, id)));
export const startCampaignAction = async (id: string) => runAction(async (ctx) => void (await startCampaign(ctx, id)));
export const pauseCampaignAction = async (id: string) => runAction(async (ctx) => void (await pauseCampaign(ctx, id)));
export const resumeCampaignAction = async (id: string) => runAction(async (ctx) => void (await resumeCampaign(ctx, id)));
export const completeCampaignAction = async (id: string) => runAction(async (ctx) => void (await completeCampaign(ctx, id)));
export const cancelCampaignAction = async (id: string) => runAction(async (ctx) => void (await cancelCampaign(ctx, id)));
export const spendAction = async (id: string, input: R) => runAction(async (ctx) => void (await addSpend(ctx, id, input)));
