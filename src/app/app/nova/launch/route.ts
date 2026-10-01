import { NextResponse, type NextRequest } from "next/server";
import { getSession, requireCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { launchNova } from "@/server/integrations/nova";

/**
 * Launch the external NOVA AI platform. The single server-side entry point for NOVA access:
 * session + permission check, audit row, then redirect. When NOVA supports SSO / signed
 * launch URLs, only `launchNova` changes. No NOVA credentials ever pass through here.
 */
export async function GET(req: NextRequest) {
  const back = (path: string) => NextResponse.redirect(new URL(path, req.url));
  const session = await getSession();
  if (!session) return back("/app/login");
  if (session.user.mustChangePassword) return back("/app/me?force=1");
  const ctx = await requireCtx();
  if (!can(ctx, "nova.use")) return back("/app/nova");
  const url = await launchNova(ctx);
  if (!url) return back("/app/nova"); // not configured → status page explains why
  const res = NextResponse.redirect(url);
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
