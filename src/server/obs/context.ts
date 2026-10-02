import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Per-request / per-job observability context (requestId, correlationId, actor, organization, module, operation).
 * Server actions, route handlers, jobs and automation executions run inside one; the logger, the error reporter and
 * unitOfWork (event correlation) read it. Never holds secrets or personal data.
 */
export type ObsContext = {
  requestId: string;
  correlationId?: string;
  actorId?: string | null;
  organizationId?: string | null;
  module?: string;
  operation?: string;
  job?: string;
};

const als = new AsyncLocalStorage<ObsContext>();

export const newRequestId = () => randomUUID();
export const currentObs = (): ObsContext | undefined => als.getStore();

export function runWithObs<T>(fields: Partial<ObsContext>, fn: () => T): T {
  const parent = als.getStore();
  const ctx: ObsContext = { ...parent, ...fields, requestId: fields.requestId ?? parent?.requestId ?? newRequestId() };
  return als.run(ctx, fn);
}
