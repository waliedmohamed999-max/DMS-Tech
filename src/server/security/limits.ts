import { AppError } from "../errors";
import { hit } from "../rate-limit";

/**
 * Per-actor limits for sensitive operations (docs/SECURITY.md#rate-limits). Generous enough for normal use, they stop
 * scripted abuse of expensive or externally visible operations. DB-backed, so they hold across instances.
 */
export const LIMITS = {
  upload: { limit: 30, windowMs: 10 * 60_000 },
  integrationTest: { limit: 10, windowMs: 10 * 60_000 },
  passwordChange: { limit: 5, windowMs: 15 * 60_000 },
  operatorRetry: { limit: 60, windowMs: 10 * 60_000 }
} as const;

export async function enforceLimit(kind: keyof typeof LIMITS, actor: string) {
  const l = LIMITS[kind];
  if (!(await hit(`limit:${kind}:${actor}`, l.limit, l.windowMs))) throw new AppError("RATE_LIMITED", "RATE_LIMITED");
}
