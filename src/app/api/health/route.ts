import { NextResponse } from "next/server";
import { liveness } from "@/server/system/health";

/** Liveness: the process answers. No database or network I/O (use /api/ready for dependencies). */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(liveness(), { headers: { "Cache-Control": "no-store" } });
}
