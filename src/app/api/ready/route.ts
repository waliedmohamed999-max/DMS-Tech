import { NextResponse } from "next/server";
import { readiness } from "@/server/system/health";

/**
 * Readiness: required dependencies only (database, migrations, critical configuration, document storage, no demo
 * accounts in production, worker heartbeat when REQUIRE_WORKER=1). Optional integrations never make the app unready.
 * Public output = check names + statuses; details are on /app/admin/system-health (system.health.view).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await readiness();
    return NextResponse.json(
      { ready: r.ready, status: r.status, time: r.time, version: r.version, checks: r.checks.map((c) => ({ name: c.name, status: c.status })) },
      { status: r.ready ? 200 : 503, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ ready: false, status: "not_ready", checks: [{ name: "readiness", status: "fail" }] }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
