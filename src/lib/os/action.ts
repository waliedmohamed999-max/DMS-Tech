import "server-only";
import { ZodError } from "zod";
import { revalidatePath } from "next/cache";
import { isAppError } from "@/server/errors";
import type { Ctx } from "@/server/context";
import { getSession, toCtx } from "./dal";
import { headers } from "next/headers";
import { runWithObs } from "@/server/obs/context";
import { classifyError, reportError, type ErrorCategory } from "@/server/obs/errors";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  /** `category` = Phase 9 standard error category; `ref` = request id to quote to support (unexpected errors only) */
  | { ok: false; error: string; field?: Record<string, string>; category?: ErrorCategory; ref?: string | null };

/**
 * Wraps a server action body: resolves the session (actions are public HTTP endpoints,
 * so this is mandatory), maps domain/validation errors to stable codes the UI can
 * translate, and revalidates the OS tree after a successful mutation.
 */
export async function runAction<T>(fn: (ctx: Ctx) => Promise<T>, opts: { revalidate?: boolean; allowMustChange?: boolean } = {}): Promise<ActionResult<T>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };
  // a temporary password must be replaced before anything else is allowed
  if (session.user.mustChangePassword && !opts.allowMustChange) return { ok: false, error: "FORBIDDEN" };
  const h = await headers();
  const ctx = toCtx(session, { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: h.get("user-agent") });
  const rid = h.get("x-request-id");
  const requestId = rid && /^[A-Za-z0-9-]{8,64}$/.test(rid) ? rid : undefined;
  return runWithObs({ requestId, correlationId: requestId, actorId: ctx.userId, organizationId: ctx.organizationId, module: "action" }, () => execute(ctx, fn, opts));
}

async function execute<T>(ctx: Ctx, fn: (ctx: Ctx) => Promise<T>, opts: { revalidate?: boolean }): Promise<ActionResult<T>> {
  try {
    const data = await fn(ctx);
    if (opts.revalidate !== false) revalidatePath("/app", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ZodError) {
      const field: Record<string, string> = {};
      for (const i of e.issues) field[String(i.path[0] ?? "_")] = i.message;
      return { ok: false, error: "VALIDATION", field, category: "VALIDATION_ERROR" };
    }
    if (isAppError(e)) {
      // specific message codes (e.g. EMAIL_TAKEN) are surfaced when present
      // codes may carry a detail suffix ("CONTRACT_EXISTS:CTR-2026-000001") — the code is the prefix
      const m = /^([A-Z][A-Z0-9_]+)(?::(.*))?$/.exec(e.message);
      return { ok: false, error: m ? m[1] : e.code, category: classifyError(e).category, ...(m?.[2] ? { field: { _detail: m[2] } } : {}) };
    }
    // database guards (triggers) raise stable codes — surface them instead of UNKNOWN
    const db = /\b(MANAGER_CYCLE|HISTORY_IMMUTABLE|LEDGER_IMMUTABLE|PAYROLL_FROZEN|PAYROLL_IMMUTABLE|PERIOD_OVERLAP|PO_IMMUTABLE|RECEIPT_IMMUTABLE|ASSIGNMENT_IMMUTABLE|DOCUMENT_VERSION_IMMUTABLE|KNOWLEDGE_VERSION_IMMUTABLE|COMMENT_IMMUTABLE|RULE_VERSION_IMMUTABLE|CAMPAIGN_IMMUTABLE|RECIPIENTS_IMMUTABLE|ATTRIBUTION_IMMUTABLE|CONSENT_IMMUTABLE)\b/.exec(String((e as Error)?.message ?? ""));
    if (db) return { ok: false, error: db[1], category: "CONFLICT" };
    // unexpected: logged (redacted) + reported; the UI gets a category and a reference only — never internals
    const c = classifyError(e);
    const ref = reportError(e, "server_action");
    return { ok: false, error: c.category === "DEPENDENCY_UNAVAILABLE" ? "DEPENDENCY_UNAVAILABLE" : "UNKNOWN", category: c.category, ref };
  }
}

export const formToObject = (fd: FormData) => {
  const o: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (k.endsWith("[]")) o[k.slice(0, -2)] = [...((o[k.slice(0, -2)] as string[]) ?? []), String(v)];
    else o[k] = typeof v === "string" ? v : v;
  }
  return o;
};
