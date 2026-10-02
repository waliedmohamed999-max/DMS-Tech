import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Safe build metadata (written by `scripts/build-info.ts` before `next build` into .build-info.json).
 * Contains version, commit SHA, build time and the migration list shipped with the build — never env values.
 */
export type BuildInfo = { version: string; commit: string | null; builtAt: string | null; environment: string; migrations: string[] };

let cached: BuildInfo | null = null;

export function buildInfo(): BuildInfo {
  if (cached) return cached;
  const root = process.cwd();
  let file: Partial<BuildInfo> = {};
  try {
    const p = path.join(root, ".build-info.json");
    if (existsSync(p)) file = JSON.parse(readFileSync(p, "utf8")) as Partial<BuildInfo>;
  } catch {
    file = {};
  }
  let version = file.version ?? "0.0.0";
  if (!file.version) {
    try {
      version = (JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version?: string }).version ?? version;
    } catch {
      /* keep default */
    }
  }
  cached = {
    version,
    commit: file.commit ?? process.env.GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    builtAt: file.builtAt ?? null,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    migrations: file.migrations ?? migrationsOnDisk()
  };
  return cached;
}

export function migrationsOnDisk(): string[] {
  const dir = path.join(process.cwd(), "prisma", "migrations");
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch {
    return [];
  }
}
