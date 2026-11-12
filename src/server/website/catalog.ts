import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { requirePermission, type Ctx } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { iconNames } from "@/components/ui/Icon";
import { services } from "@/content/services";
import { basisPrice, fileCatalog, groupAliases, offerAliases, offersCopy, retiredOffers, type Catalog } from "@/content/offers";

/**
 * The website's /offers catalog, edited in the dashboard (/app/website/offers).
 *   working copy (DRAFT) → publish → PUBLISHED (what visitors see); the previous published copy becomes ARCHIVED.
 * Publishing is refused while the catalog has a problem a visitor would see (a duplicate link, an offer that costs more
 * than its packages, a package that doesn't exist…), so the page can never contradict itself.
 * Until the first publish, and whenever the database can't be read, the site shows the built-in catalog
 * (src/content/offers/) — the page never goes blank.
 */

export const CATALOG_KEY = "offers";

// --- shape ----------------------------------------------------------------------------------------

const text = (max: number) => z.string().trim().max(max);
const L = (max = 600) => z.object({ ar: text(max), en: text(max) });
const reqL = (max = 600) => z.object({ ar: text(max).min(1), en: text(max).min(1) });
const icon = z.enum(iconNames as [string, ...string[]]);
const slug = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "SLUG").max(60);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "DATE");
const money = z.number().finite().min(0).max(10_000_000);

const tierSchema = z.object({
  key: slug,
  icon,
  name: reqL(80),
  tagline: L(200),
  idealFor: L(300),
  model: L(300),
  about: L(1200),
  youProvide: z.array(reqL(300)).max(20),
  after: L(600),
  price: money.nullable(),
  from: z.boolean(),
  indicative: z.boolean().optional(),
  period: L(60).nullable(),
  billing: z.enum(["one-time", "monthly", "term"]),
  termMonths: z.number().int().min(1).max(60).optional(),
  delivery: L(120),
  revisions: L(120).optional(),
  featured: z.boolean().optional(),
  features: z.array(reqL(300)).max(40),
  excludes: z.array(reqL(300)).max(20),
  annual: money.optional()
});
const groupSchema = z.object({
  id: slug,
  segment: z.enum(["smb", "business"]),
  service: slug,
  icon,
  title: reqL(120),
  short: reqL(60),
  text: L(1200),
  highlights: z.array(reqL(300)).max(10),
  notice: L(1500),
  tiers: z.array(tierSchema).min(1).max(12),
  journey: z.array(z.object({ icon, title: reqL(120), text: L(600), tier: z.string().max(60) })).max(8).optional(),
  draft: z.boolean().optional()
});
const offerSchema = z.object({
  slug,
  service: slug,
  icon,
  campaign: reqL(80),
  name: reqL(120),
  pitch: L(400),
  forWho: L(600),
  price: money,
  basis: z.array(z.object({ key: z.string().max(60), months: z.number().int().min(1).max(36).optional() })).min(1).max(6),
  terms: z.array(reqL(600)).max(12),
  startsAt: isoDay,
  endsAt: isoDay,
  approved: z.string().trim().max(200).nullable()
});

/** Page texts: every text the code knows, with stored wording where it has the same shape (new texts fall back to the built-in wording). */
function mergeCopy(def: unknown, val: unknown): unknown {
  const isL = (v: unknown): v is { ar: string; en: string } => !!v && typeof v === "object" && typeof (v as { ar?: unknown }).ar === "string" && typeof (v as { en?: unknown }).en === "string";
  if (isL(def)) return isL(val) ? { ar: val.ar.slice(0, 3000), en: val.en.slice(0, 3000) } : def;
  if (typeof def === "string") return typeof val === "string" && val.length <= 60 ? val : def; // icon names in lists
  if (Array.isArray(def)) {
    if (!Array.isArray(val) || def.length === 0) return def;
    return val.slice(0, 40).map((v) => mergeCopy(def[0], v));
  }
  if (def && typeof def === "object") {
    const src = val && typeof val === "object" ? (val as Record<string, unknown>) : {};
    return Object.fromEntries(Object.entries(def).map(([k, d]) => [k, mergeCopy(d, src[k])]));
  }
  return def;
}

/** Throws a VALIDATION error (with the first problem's path) when the JSON isn't a catalog; texts are merged with the built-in ones. */
export function parseCatalog(raw: unknown): Catalog {
  const r = z.object({ groups: z.array(groupSchema).min(1).max(30), offers: z.array(offerSchema).max(30), copy: z.unknown() }).safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    throw invalid(`CATALOG_INVALID:${i.path.join(".")}`, { path: i.path, message: i.message });
  }
  return { groups: r.data.groups as Catalog["groups"], offers: r.data.offers as Catalog["offers"], copy: mergeCopy(offersCopy, r.data.copy) as Catalog["copy"] };
}

// --- problems a visitor would see -----------------------------------------------------------------

export type CatalogProblem = { where: string; ar: string; en: string };

/** Everything that blocks publishing, in words the editor understands. Empty = publishable. */
export function checkCatalog(cat: Catalog): CatalogProblem[] {
  const out: CatalogProblem[] = [];
  const p = (where: string, ar: string, en: string) => out.push({ where, ar, en });
  const serviceSlugs = new Set(services.map((s) => s.slug));
  const reserved = new Set([...Object.keys(retiredOffers), ...Object.entries(offerAliases).filter(([k, v]) => k !== v).map(([k]) => k), ...Object.keys(groupAliases), "deal"]);
  const groupIds = new Set<string>();
  const tierKeys = new Map<string, { group: Catalog["groups"][number]; tier: Catalog["groups"][number]["tiers"][number] }>();

  for (const g of cat.groups) {
    const where = g.title.ar || g.id;
    if (groupIds.has(g.id)) p(where, `رابط القسم «${g.id}» مكرر في قسم آخر`, `Section link "${g.id}" is used twice`);
    groupIds.add(g.id);
    if (!serviceSlugs.has(g.service)) p(where, `الخدمة المرتبطة «${g.service}» غير موجودة في صفحات الخدمات`, `Linked service "${g.service}" has no service page`);
    for (const t of g.tiers) {
      const tw = `${where} ← ${t.name.ar || t.key}`;
      if (tierKeys.has(t.key)) p(tw, `رابط الباقة «${t.key}» مكرر في باقة أخرى`, `Package link "${t.key}" is used twice`);
      if (reserved.has(t.key)) p(tw, `رابط الباقة «${t.key}» محجوز لرابط قديم، اختر رابطاً آخر`, `Package link "${t.key}" is reserved for an old link`);
      tierKeys.set(t.key, { group: g, tier: t });
      if (t.price === null && !t.from) p(tw, "باقة بلا سعر يجب أن تكون «حسب المتطلبات» (يبدأ من)", "A package without a price must be marked “from / on request”");
      if (t.billing === "term" && !t.termMonths) p(tw, "عقد المدة يحتاج عدد الأشهر", "A term contract needs its number of months");
      if (t.annual !== undefined && t.billing !== "monthly") p(tw, "السعر السنوي للاشتراكات الشهرية فقط", "A yearly price only applies to monthly plans");
      if (t.annual !== undefined && t.price !== null && t.annual >= t.price * 12) p(tw, "السعر السنوي يجب أن يكون أقل من 12 شهراً بالسعر الشهري", "The yearly price must be below 12 monthly payments");
      if (t.features.length === 0) p(tw, "اكتب ما تشمله الباقة (بند واحد على الأقل)", "List what the package includes (at least one item)");
    }
    for (const j of g.journey ?? []) if (!g.tiers.some((t) => t.key === j.tier) && !cat.groups.some((x) => x.tiers.some((t) => t.key === j.tier))) p(where, `خطوة «${j.title.ar}» مرتبطة بباقة غير موجودة (${j.tier})`, `Journey step "${j.title.en}" links to a missing package (${j.tier})`);
  }

  const slugs = new Set<string>();
  for (const o of cat.offers) {
    const where = `${o.name.ar || o.slug}`;
    if (slugs.has(o.slug)) p(where, `رابط العرض «${o.slug}» مكرر`, `Offer link "${o.slug}" is used twice`);
    slugs.add(o.slug);
    if (tierKeys.has(o.slug) || reserved.has(o.slug)) p(where, `رابط العرض «${o.slug}» مستخدم لباقة أو رابط قديم`, `Offer link "${o.slug}" is taken by a package or an old link`);
    if (!serviceSlugs.has(o.service)) p(where, `الخدمة المرتبطة «${o.service}» غير موجودة`, `Linked service "${o.service}" does not exist`);
    if (o.endsAt < o.startsAt) p(where, "تاريخ نهاية العرض قبل تاريخ بدايته", "The offer ends before it starts");
    for (const b of o.basis) {
      const f = tierKeys.get(b.key);
      if (!f) p(where, `العرض مبني على باقة غير موجودة (${b.key})`, `The offer uses a missing package (${b.key})`);
      else if (f.tier.from || f.tier.price === null) p(where, `«${f.tier.name.ar}» سعرها «يبدأ من»، والعرض يحتاج باقة بسعر ثابت`, `"${f.tier.name.en}" has a “from” price; offers need fixed-price packages`);
      else if (f.group.draft) p(where, `«${f.tier.name.ar}» في قسم مسودة لا يظهر للزوار`, `"${f.tier.name.en}" is in a draft section`);
    }
    const base = basisPrice(o, cat.groups);
    if (base !== null && o.price >= base) p(where, `سعر العرض (${o.price}) ليس أقل من سعر باقاته (${base}) — هذا تعارض`, `The offer price (${o.price}) is not below its packages (${base})`);
  }
  return out;
}

/** Non-blocking notes shown next to the publish button. */
export function catalogNotes(cat: Catalog): CatalogProblem[] {
  const out: CatalogProblem[] = [];
  for (const o of cat.offers) {
    if (!o.approved) out.push({ where: o.name.ar, ar: "العرض غير معتمد، فلن يظهر للزوار حتى تعتمده", en: "Not approved: visitors won't see it until it is" });
    const base = basisPrice(o, cat.groups);
    if (base && o.price < base) {
      const off = Math.round((1 - o.price / base) * 100);
      if (off > 30) out.push({ where: o.name.ar, ar: `الخصم ${off}% كبير — تأكد أنه مقصود`, en: `${off}% off is a deep discount — make sure it is intended` });
    }
    if (o.endsAt < new Date().toISOString().slice(0, 10)) out.push({ where: o.name.ar, ar: "تاريخ العرض انتهى، فلن يظهر", en: "This offer has ended and won't show" });
  }
  return out;
}

// --- what visitors see ----------------------------------------------------------------------------

let cached: { at: number; orgSlug: string; cat: Catalog; version: number } | null = null;
const TTL_MS = 30_000;

async function websiteOrgId(): Promise<string | null> {
  const slugName = process.env.OS_ORG_SLUG ?? "dms-tech";
  return (await prisma.organization.findUnique({ where: { slug: slugName }, select: { id: true } }))?.id ?? null;
}

/** The published catalog (cached for 30 s per server process); the built-in one before the first publish or if the database is down. */
export async function publishedCatalog(): Promise<Catalog> {
  const orgSlug = process.env.OS_ORG_SLUG ?? "dms-tech";
  if (cached && cached.orgSlug === orgSlug && Date.now() - cached.at < TTL_MS) return cached.cat;
  try {
    const org = await websiteOrgId();
    const row = org ? await prisma.siteCatalog.findFirst({ where: { organizationId: org, key: CATALOG_KEY, status: "PUBLISHED" }, select: { data: true, version: true } }) : null;
    const cat = row ? parseCatalog(row.data) : fileCatalog;
    cached = { at: Date.now(), orgSlug, cat, version: row?.version ?? 0 };
    return cat;
  } catch (e) {
    // the page must never go blank: show the last good copy, else the built-in one
    console.error("[catalog] could not read the published catalog", (e as Error)?.message);
    return cached?.cat ?? fileCatalog;
  }
}
export const forgetPublishedCatalog = () => {
  cached = null;
};

/** For `?preview=draft` on the public page: the working copy, for signed-in staff who may see it. */
export async function draftCatalogFor(ctx: Ctx): Promise<Catalog | null> {
  if (!ctx.permissions.has("website.offers.view")) return null;
  const row = await prisma.siteCatalog.findFirst({ where: { organizationId: ctx.organizationId, key: CATALOG_KEY, status: "DRAFT" }, select: { data: true } });
  if (!row) return null;
  try {
    return parseCatalog(row.data);
  } catch {
    return null;
  }
}

// --- dashboard ------------------------------------------------------------------------------------

const userName = async (ids: (string | null | undefined)[]) => {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  const users = list.length ? await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true } }) : [];
  return (id: string | null | undefined) => users.find((u) => u.id === id)?.name ?? null;
};

/** What the editor opens with: the working copy (or the live / built-in catalog to start from), its status and the history. */
export async function catalogEditorState(ctx: Ctx) {
  requirePermission(ctx, "website.offers.view");
  const rows = await prisma.siteCatalog.findMany({
    where: { organizationId: ctx.organizationId, key: CATALOG_KEY },
    orderBy: [{ status: "asc" }, { version: "desc" }],
    select: { id: true, status: true, version: true, note: true, data: true, updatedAt: true, updatedById: true, publishedAt: true, publishedById: true }
  });
  const draft = rows.find((r) => r.status === "DRAFT") ?? null;
  const live = rows.find((r) => r.status === "PUBLISHED") ?? null;
  const name = await userName(rows.flatMap((r) => [r.updatedById, r.publishedById]));
  const safe = (d: unknown) => {
    try {
      return parseCatalog(d);
    } catch {
      return null;
    }
  };
  const liveCat = live ? (safe(live.data) ?? fileCatalog) : fileCatalog;
  const working = draft ? (safe(draft.data) ?? liveCat) : liveCat;
  return {
    catalog: working,
    hasDraft: Boolean(draft),
    draftSavedAt: draft?.updatedAt ?? null,
    draftSavedBy: draft ? name(draft.updatedById) : null,
    live: live ? { version: live.version, publishedAt: live.publishedAt, publishedBy: name(live.publishedById) } : null,
    problems: checkCatalog(working),
    notes: catalogNotes(working),
    history: rows
      .filter((r) => r.status !== "DRAFT")
      .sort((a, b) => b.version - a.version)
      .slice(0, 30)
      .map((r) => ({ id: r.id, version: r.version, live: r.status === "PUBLISHED", note: r.note, publishedAt: r.publishedAt, publishedBy: name(r.publishedById) }))
  };
}

/** Saves the working copy (creating it on the first save). Shape is checked here; contradictions only block publishing. */
export async function saveCatalogDraft(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "website.offers.edit");
  const cat = parseCatalog(raw);
  const data = cat as unknown as Prisma.InputJsonValue;
  return unitOfWork(ctx, async (tx, uow) => {
    const draft = await tx.siteCatalog.findFirst({ where: { organizationId: ctx.organizationId, key: CATALOG_KEY, status: "DRAFT" }, select: { id: true } });
    const row = draft
      ? await tx.siteCatalog.update({ where: { id: draft.id }, data: { data, updatedById: ctx.userId }, select: { id: true } })
      : await tx.siteCatalog.create({ data: { organizationId: ctx.organizationId, key: CATALOG_KEY, status: "DRAFT", data, createdById: ctx.userId, updatedById: ctx.userId }, select: { id: true } });
    await uow.audit({ action: "website.offers.draft_saved", entityType: "SiteCatalog", entityId: row.id, after: { groups: cat.groups.length, packages: cat.groups.reduce((s, g) => s + g.tiers.length, 0), offers: cat.offers.length } });
    return { id: row.id, problems: checkCatalog(cat), notes: catalogNotes(cat) };
  });
}

/** Publishes the working copy: it becomes what visitors see, the previous version moves to the history. */
export async function publishCatalogDraft(ctx: Ctx, rawNote?: unknown) {
  requirePermission(ctx, "website.offers.publish");
  const note = typeof rawNote === "string" ? rawNote.trim().slice(0, 300) || null : null;
  const out = await unitOfWork(ctx, async (tx, uow) => {
    const draft = await tx.siteCatalog.findFirst({ where: { organizationId: ctx.organizationId, key: CATALOG_KEY, status: "DRAFT" } });
    if (!draft) throw conflict("CATALOG_NO_DRAFT");
    const cat = parseCatalog(draft.data);
    const problems = checkCatalog(cat);
    if (problems.length) throw conflict(`CATALOG_HAS_PROBLEMS:${problems.length}`);
    const last = await tx.siteCatalog.aggregate({ where: { organizationId: ctx.organizationId, key: CATALOG_KEY }, _max: { version: true } });
    const version = (last._max.version ?? 0) + 1;
    await tx.siteCatalog.updateMany({ where: { organizationId: ctx.organizationId, key: CATALOG_KEY, status: "PUBLISHED" }, data: { status: "ARCHIVED" } });
    await tx.siteCatalog.update({ where: { id: draft.id }, data: { status: "PUBLISHED", version, note, data: cat as unknown as Prisma.InputJsonValue, publishedAt: new Date(), publishedById: ctx.userId, updatedById: ctx.userId } });
    await uow.audit({ action: "website.offers.published", entityType: "SiteCatalog", entityId: draft.id, after: { version, note } });
    return { version };
  });
  forgetPublishedCatalog();
  return out;
}

/** Throws away the working copy (the live page is untouched). */
export async function discardCatalogDraft(ctx: Ctx) {
  requirePermission(ctx, "website.offers.edit");
  return unitOfWork(ctx, async (tx, uow) => {
    const draft = await tx.siteCatalog.findFirst({ where: { organizationId: ctx.organizationId, key: CATALOG_KEY, status: "DRAFT" }, select: { id: true } });
    if (!draft) return;
    await tx.siteCatalog.delete({ where: { id: draft.id } });
    await uow.audit({ action: "website.offers.draft_discarded", entityType: "SiteCatalog", entityId: draft.id });
  });
}

/** Copies a published version (or the built-in catalog, id "builtin") into the working copy, to review and publish again. */
export async function restoreCatalogVersion(ctx: Ctx, id: string) {
  requirePermission(ctx, "website.offers.edit");
  let data: unknown;
  if (id === "builtin") data = fileCatalog;
  else {
    const row = await prisma.siteCatalog.findFirst({ where: { id, organizationId: ctx.organizationId, key: CATALOG_KEY, status: { in: ["PUBLISHED", "ARCHIVED"] } }, select: { data: true } });
    if (!row) throw notFound("SiteCatalog");
    data = row.data;
  }
  return saveCatalogDraft(ctx, parseCatalog(data));
}
