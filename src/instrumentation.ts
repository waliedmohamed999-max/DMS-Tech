/**
 * Runs once when a Next.js server instance starts (not during `next build`).
 * Phase 9: fail fast on invalid PRODUCTION configuration — keys + codes are logged (never values) and the process
 * exits instead of serving requests with a broken configuration.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { refuseInvalidStartup } = await import("./server/system/config");
  await refuseInvalidStartup();
}
