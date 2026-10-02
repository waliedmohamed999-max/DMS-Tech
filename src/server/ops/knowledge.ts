import { z } from "zod";
import type { KnowledgeStatus, Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, canAny, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { optId, reqText } from "../crm/normalize";
import { nextNumber } from "../crm/sequence";
import { myDept } from "./shared";

/**
 * Knowledge base (docs/OPERATIONS.md#knowledge). Internal documentation — no AI, no embeddings.
 *   working copy: DRAFT → REVIEW → (publish) → PUBLISHED; ARCHIVED hides it.
 * Publishing writes an immutable KnowledgeArticleVersion and points the article at it. Readers ONLY see the
 * published version; editing a published article changes the working copy (status back to DRAFT) while the
 * previously published content stays live until the next publish — operational knowledge is never silently rewritten.
 * Visibility: ALL_EMPLOYEES · DEPARTMENT · ROLE_RESTRICTED (role keys) · SUPPORT_ONLY (support staff).
 */

export const DEFAULT_KB_CATEGORIES: [string, string, string][] = [
  ["how-to", "أدلة الاستخدام", "How-to guides"],
  ["support", "الدعم الفني", "Support playbooks"],
  ["policies", "السياسات الداخلية", "Internal policies"],
  ["delivery", "التنفيذ والتطوير", "Delivery & engineering"],
  ["operations", "العمليات", "Operations"]
];
export async function ensureKnowledgeCategories(organizationId: string) {
  await prisma.knowledgeCategory.createMany({ data: DEFAULT_KB_CATEGORIES.map(([key, nameAr, nameEn], i) => ({ organizationId, key, nameAr, nameEn, sortOrder: i })), skipDuplicates: true });
}
export const listKbCategories = (organizationId: string) => prisma.knowledgeCategory.findMany({ where: { organizationId, active: true }, orderBy: { sortOrder: "asc" } });

const isEditor = (ctx: Ctx) => can(ctx, "knowledge.manage");
const isSupport = (ctx: Ctx) => canAny(ctx, "support.tickets.view", "support.tickets.manage");

/** Published articles the caller may read. */
async function readableWhere(ctx: Ctx): Promise<Prisma.KnowledgeArticleWhereInput> {
  const dept = await myDept(ctx);
  const vis: Prisma.KnowledgeArticleWhereInput[] = [{ visibility: "ALL_EMPLOYEES" }];
  if (dept) vis.push({ visibility: "DEPARTMENT", departmentId: dept });
  if (ctx.roleKeys.length) vis.push({ visibility: "ROLE_RESTRICTED", roleKeys: { hasSome: ctx.roleKeys } });
  if (isSupport(ctx)) vis.push({ visibility: "SUPPORT_ONLY" });
  return { AND: [{ publishedVersionId: { not: null }, status: { not: "ARCHIVED" } }, isEditor(ctx) ? {} : { OR: vis }] };
}

const articleSchema = z.object({
  titleAr: reqText(2, 200),
  titleEn: reqText(2, 200),
  bodyAr: reqText(10, 50000),
  bodyEn: reqText(10, 50000),
  categoryId: z.string().min(1),
  visibility: z.enum(["ALL_EMPLOYEES", "DEPARTMENT", "ROLE_RESTRICTED", "SUPPORT_ONLY"]).default("ALL_EMPLOYEES"),
  departmentId: optId,
  roleKeys: z.preprocess((v) => (typeof v === "string" ? v.split(",") : v ?? []), z.array(z.string().trim().max(60)).max(20)).transform((a) => [...new Set(a.filter(Boolean))]),
  tags: z.preprocess((v) => (typeof v === "string" ? v.split(",") : v ?? []), z.array(z.string().trim().toLowerCase().max(40)).max(15)).transform((a) => [...new Set(a.filter(Boolean))])
});

async function check(tx: Tx, ctx: Ctx, input: z.output<typeof articleSchema>) {
  if (!(await tx.knowledgeCategory.findFirst({ where: { id: input.categoryId, organizationId: ctx.organizationId } }))) throw invalid("UNKNOWN_CATEGORY");
  if (input.visibility === "DEPARTMENT" && !input.departmentId) throw invalid("DEPARTMENT_REQUIRED");
  if (input.visibility === "ROLE_RESTRICTED" && !input.roleKeys.length) throw invalid("ROLES_REQUIRED");
  if (input.roleKeys.length) {
    const n = await tx.role.count({ where: { organizationId: ctx.organizationId, key: { in: input.roleKeys } } });
    if (n !== input.roleKeys.length) throw invalid("UNKNOWN_ROLE");
  }
}
const fields = (i: z.output<typeof articleSchema>) => ({ titleAr: i.titleAr, titleEn: i.titleEn, bodyAr: i.bodyAr, bodyEn: i.bodyEn, categoryId: i.categoryId, visibility: i.visibility, departmentId: i.visibility === "DEPARTMENT" ? i.departmentId ?? null : null, roleKeys: i.visibility === "ROLE_RESTRICTED" ? i.roleKeys : [], tags: i.tags });

export async function createArticle(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "knowledge.create");
  const input = articleSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    await check(tx, ctx, input);
    const number = await nextNumber(tx, ctx.organizationId, "KB");
    const a = await tx.knowledgeArticle.create({ data: { ...fields(input), organizationId: ctx.organizationId, number, authorId: ctx.userId } });
    await uow.audit({ action: "knowledge.created", entityType: "KnowledgeArticle", entityId: a.id, after: { number, titleEn: a.titleEn, visibility: a.visibility } });
    return { id: a.id, number };
  });
}

async function lockArticle(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "KnowledgeArticle" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const a = await tx.knowledgeArticle.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!a) throw notFound("KnowledgeArticle");
  return a;
}
const mayEdit = (ctx: Ctx, a: { authorId: string }) => isEditor(ctx) || (can(ctx, "knowledge.create") && a.authorId === ctx.userId);

export async function updateArticle(ctx: Ctx, id: string, raw: unknown) {
  const input = articleSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const a = await lockArticle(tx, ctx, id);
    if (!mayEdit(ctx, a)) throw forbidden("knowledge.manage (or the author)");
    if (a.status === "ARCHIVED") throw conflict("ARTICLE_ARCHIVED");
    await check(tx, ctx, input);
    // the working copy changes; the published version (if any) stays live until republished
    await tx.knowledgeArticle.update({ where: { id }, data: { ...fields(input), status: a.status === "PUBLISHED" || a.status === "REVIEW" ? "DRAFT" : a.status } });
    await uow.audit({ action: "knowledge.updated", entityType: "KnowledgeArticle", entityId: id, before: { titleEn: a.titleEn, status: a.status, visibility: a.visibility }, after: { titleEn: input.titleEn, status: a.status === "DRAFT" ? "DRAFT" : "DRAFT (revision)", visibility: input.visibility } });
  });
}

export async function submitArticleForReview(ctx: Ctx, id: string) {
  return unitOfWork(ctx, async (tx, uow) => {
    const a = await lockArticle(tx, ctx, id);
    if (!mayEdit(ctx, a)) throw forbidden("knowledge.manage (or the author)");
    if (a.status !== "DRAFT") throw conflict(`ARTICLE_INVALID_TRANSITION:${a.status}`);
    await tx.knowledgeArticle.update({ where: { id }, data: { status: "REVIEW", reviewRequestedAt: new Date(), reviewNotifiedAt: null, reviewComment: null } });
    await uow.audit({ action: "knowledge.review_requested", entityType: "KnowledgeArticle", entityId: id, before: { status: "DRAFT" }, after: { status: "REVIEW" } });
    uow.emit({ type: "knowledge.review_requested", entityType: "KnowledgeArticle", entityId: id, payload: { articleId: id, number: a.number, title: a.titleEn, authorId: a.authorId } });
  });
}

/** Reviewer sends it back with a comment. */
export async function returnArticle(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "knowledge.review");
  const { comment } = z.object({ comment: reqText(3, 2000) }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const a = await lockArticle(tx, ctx, id);
    if (a.status !== "REVIEW") throw conflict(`ARTICLE_INVALID_TRANSITION:${a.status}`);
    await tx.knowledgeArticle.update({ where: { id }, data: { status: "DRAFT", reviewComment: comment } });
    await uow.audit({ action: "knowledge.returned", entityType: "KnowledgeArticle", entityId: id, before: { status: "REVIEW" }, after: { status: "DRAFT", comment } });
  });
}

/** Publish the reviewed working copy as a new immutable version (author cannot self-publish without knowledge.manage). */
export async function publishArticle(ctx: Ctx, id: string) {
  requirePermission(ctx, "knowledge.publish");
  return unitOfWork(ctx, async (tx, uow) => {
    const a = await lockArticle(tx, ctx, id);
    if (a.status !== "REVIEW") throw conflict(`ARTICLE_INVALID_TRANSITION:${a.status}`);
    if (a.authorId === ctx.userId && !isEditor(ctx)) throw forbidden("self-publish (knowledge.manage required)");
    const version = a.currentVersion + 1;
    const v = await tx.knowledgeArticleVersion.create({ data: { articleId: id, version, titleAr: a.titleAr, titleEn: a.titleEn, bodyAr: a.bodyAr, bodyEn: a.bodyEn, publishedById: ctx.userId } });
    const now = new Date();
    await tx.knowledgeArticle.update({ where: { id }, data: { status: "PUBLISHED", publishedVersionId: v.id, currentVersion: version, publishedAt: now, publishedById: ctx.userId } });
    await uow.audit({ action: "knowledge.published", entityType: "KnowledgeArticle", entityId: id, before: { status: "REVIEW", liveVersion: a.currentVersion || null }, after: { status: "PUBLISHED", version } });
    uow.emit({ type: "knowledge.published", entityType: "KnowledgeArticle", entityId: id, payload: { articleId: id, number: a.number, title: a.titleEn, version, authorId: a.authorId }, activity: { entityLabel: `${a.number} · ${a.titleEn}`, href: `/app/knowledge/${id}`, visibility: "knowledge.view" } });
  });
}

export async function archiveArticle(ctx: Ctx, id: string) {
  requirePermission(ctx, "knowledge.publish");
  return unitOfWork(ctx, async (tx, uow) => {
    const a = await lockArticle(tx, ctx, id);
    if (a.status === "ARCHIVED") return;
    await tx.knowledgeArticle.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await uow.audit({ action: "knowledge.archived", entityType: "KnowledgeArticle", entityId: id, before: { status: a.status }, after: { status: "ARCHIVED" } });
  });
}

// --- read ----------------------------------------------------------------------------------------

const listSchema = z.object({ q: z.string().trim().max(100).optional(), category: z.string().max(40).optional(), status: z.string().max(20).optional() });

/** Readers: published + visible, searching title / body (both languages) / tags of the LIVE version. Editors also see working copies. */
export async function searchArticles(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "knowledge.view");
  const f = listSchema.parse(raw ?? {});
  const q = f.q;
  const text: Prisma.KnowledgeArticleWhereInput | null = q
    ? { OR: [{ publishedVersion: { OR: [{ titleAr: { contains: q, mode: "insensitive" } }, { titleEn: { contains: q, mode: "insensitive" } }, { bodyAr: { contains: q, mode: "insensitive" } }, { bodyEn: { contains: q, mode: "insensitive" } }] } }, { tags: { has: q.toLowerCase() } }, { number: { contains: q.toUpperCase() } }] }
    : null;
  const published = await prisma.knowledgeArticle.findMany({
    where: { AND: [{ organizationId: ctx.organizationId }, await readableWhere(ctx), ...(f.category ? [{ categoryId: f.category }] : []), ...(text ? [text] : [])] },
    orderBy: { publishedAt: "desc" }, take: 100,
    include: { category: { select: { nameAr: true, nameEn: true } }, publishedVersion: { select: { titleAr: true, titleEn: true, bodyAr: true, bodyEn: true, version: true } } }
  });
  // working copies: my own drafts, plus everything for reviewers / publishers / editors
  const staff = canAny(ctx, "knowledge.review", "knowledge.publish", "knowledge.manage");
  const statusFilter = f.status && ["DRAFT", "REVIEW", "ARCHIVED"].includes(f.status) ? { status: f.status as KnowledgeStatus } : { status: { in: ["DRAFT", "REVIEW"] as KnowledgeStatus[] } };
  const work = can(ctx, "knowledge.create") || staff
    ? await prisma.knowledgeArticle.findMany({
        where: { organizationId: ctx.organizationId, ...statusFilter, ...(staff ? {} : { authorId: ctx.userId }), ...(f.category ? { categoryId: f.category } : {}), ...(q ? { OR: [{ titleAr: { contains: q, mode: "insensitive" } }, { titleEn: { contains: q, mode: "insensitive" } }] } : {}) },
        orderBy: { updatedAt: "desc" }, take: 100, include: { category: { select: { nameAr: true, nameEn: true } } }
      })
    : [];
  return { published, work, staff };
}

export async function getArticle(ctx: Ctx, id: string) {
  requirePermission(ctx, "knowledge.view");
  const a = await prisma.knowledgeArticle.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { category: true, department: { select: { name: true, nameAr: true } }, publishedVersion: true, versions: { orderBy: { version: "desc" }, select: { id: true, version: true, publishedById: true, createdAt: true } } } });
  if (!a) throw notFound("KnowledgeArticle");
  const readable = Boolean(await prisma.knowledgeArticle.findFirst({ where: { AND: [{ id }, await readableWhere(ctx)] }, select: { id: true } }));
  const editor = mayEdit(ctx, a) || canAny(ctx, "knowledge.review", "knowledge.publish");
  if (!readable && !editor) throw notFound("KnowledgeArticle");
  const people = await prisma.user.findMany({ where: { id: { in: [a.authorId, a.publishedById, ...a.versions.map((v) => v.publishedById)].filter(Boolean) as string[] } }, select: { id: true, name: true, nameAr: true } });
  return {
    article: a, readable, editor, people,
    can: { edit: mayEdit(ctx, a) && a.status !== "ARCHIVED", submit: mayEdit(ctx, a) && a.status === "DRAFT", review: can(ctx, "knowledge.review") && a.status === "REVIEW", publish: can(ctx, "knowledge.publish") && a.status === "REVIEW" && (a.authorId !== ctx.userId || isEditor(ctx)), archive: can(ctx, "knowledge.publish") && a.status !== "ARCHIVED" }
  };
}

/** Deterministic related articles for a ticket: article tags matching the ticket's tags or category. No AI. */
export async function relatedArticles(ctx: Ctx, t: { category: string; tags: { tag: string }[] }) {
  if (!can(ctx, "knowledge.view")) return [];
  const keys = [t.category.toLowerCase().replace(/_/g, "-"), ...t.tags.map((x) => x.tag)];
  return prisma.knowledgeArticle.findMany({ where: { AND: [{ organizationId: ctx.organizationId }, await readableWhere(ctx), { tags: { hasSome: keys } }] }, take: 5, orderBy: { publishedAt: "desc" }, select: { id: true, number: true, publishedVersion: { select: { titleAr: true, titleEn: true } } } });
}
