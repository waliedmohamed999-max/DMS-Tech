import "server-only";
import { getSession, toCtx } from "@/lib/os/dal";
import { draftCatalogFor, publishedCatalog } from "@/server/website/catalog";
import type { Catalog } from "@/content/offers";

/**
 * The catalog a request to /offers shows: the published one, or — with `?preview=draft` and a signed-in user who may
 * see it — the dashboard's working copy (never cached, never shown to visitors).
 */
export async function requestCatalog(preview: string | string[] | undefined): Promise<{ cat: Catalog; preview: boolean }> {
  if (preview === "draft") {
    const s = await getSession();
    const draft = s ? await draftCatalogFor(toCtx(s)) : null;
    if (draft) return { cat: draft, preview: true };
  }
  return { cat: await publishedCatalog(), preview: false };
}
