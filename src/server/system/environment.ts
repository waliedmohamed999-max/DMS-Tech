import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../db";

/**
 * Deployment environments (Phase 10 — docs/ENVIRONMENTS.md).
 *
 *   APP_ENV = development | test | staging | production
 *
 * NODE_ENV only says "optimised build"; staging AND production both run NODE_ENV=production. APP_ENV says WHICH
 * deployment this is, and three markers make a cross-wired deployment fail loudly instead of touching the wrong data:
 *   1. DATABASE  — DeploymentMarker row (written once by bootstrap, immutable): readiness fails on mismatch.
 *   2. STORAGE   — `.dms-environment` file in the local storage root (`_meta/environment` object on S3).
 *   3. PROVIDERS — outside production, the outbox refuses deliveries through PRODUCTION integration connections
 *                  (real WhatsApp numbers, production webhooks); staging uses SANDBOX connections.
 */
export type AppEnv = "development" | "test" | "staging" | "production";
export const APP_ENVS: AppEnv[] = ["development", "test", "staging", "production"];

export function appEnv(env: Record<string, string | undefined> = process.env): AppEnv {
  const v = env.APP_ENV?.trim().toLowerCase();
  if (v && (APP_ENVS as string[]).includes(v)) return v as AppEnv;
  if (env.NODE_ENV === "test" || env.VITEST) return "test";
  // a production build without an explicit APP_ENV is treated as production (the strictest), and config validation flags it
  return env.NODE_ENV === "production" ? "production" : "development";
}
export const isProduction = (env: Record<string, string | undefined> = process.env) => appEnv(env) === "production";

/** Bootstrap: write the marker once (immutable afterwards — DB trigger). Returns the marker's environment. */
export async function ensureDeploymentMarker(env: AppEnv = appEnv()) {
  const m = await prisma.deploymentMarker.findUnique({ where: { id: 1 } });
  if (m) return m.environment;
  await prisma.deploymentMarker.createMany({ data: [{ id: 1, environment: env }], skipDuplicates: true });
  return (await prisma.deploymentMarker.findUniqueOrThrow({ where: { id: 1 } })).environment;
}

export async function databaseEnvironment() {
  return (await prisma.deploymentMarker.findUnique({ where: { id: 1 } }))?.environment ?? null;
}

/** Local storage marker. Created on first check, compared afterwards. */
export function checkLocalStorageMarker(root: string, env: AppEnv = appEnv()): { ok: boolean; marker: string } {
  const file = path.join(root, ".dms-environment");
  if (!existsSync(file)) {
    mkdirSync(root, { recursive: true });
    writeFileSync(file, env, { flag: "wx" });
    return { ok: true, marker: env };
  }
  const marker = readFileSync(file, "utf8").trim();
  return { ok: marker === env, marker };
}

/** Outbound guard: may this environment deliver through a connection of `connectionEnv`? */
export function outboundAllowed(connectionEnv: "PRODUCTION" | "SANDBOX", env: AppEnv = appEnv()) {
  if (connectionEnv === "SANDBOX") return env !== "production";
  return env === "production" || process.env.ALLOW_NON_PRODUCTION_OUTBOUND === "1";
}
