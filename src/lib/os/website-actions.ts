"use server";

import "@/server";
import { discardCatalogDraft, publishCatalogDraft, restoreCatalogVersion, saveCatalogDraft } from "@/server/website/catalog";
import { runAction } from "./action";

/** Thin adapters for the /offers catalog editor — the service re-checks permissions and the catalog on the server. */
export const saveCatalogAction = async (catalog: unknown) => runAction(async (ctx) => saveCatalogDraft(ctx, catalog));
export const publishCatalogAction = async (note: string) => runAction(async (ctx) => publishCatalogDraft(ctx, note));
export const discardCatalogAction = async () => runAction(async (ctx) => void (await discardCatalogDraft(ctx)));
/** Copies a published version ("builtin" = the original built-in catalog) into the working copy. */
export const restoreCatalogAction = async (id: string) => runAction(async (ctx) => restoreCatalogVersion(ctx, id));
