import { z } from "zod";
import type { Document, DocumentClassification, DocumentEntityType, Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { can, canAny, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { optId, optText, reqText } from "../crm/normalize";
import { nextNumber } from "../crm/sequence";
import { clientWhere, ownedWhere } from "../crm/scope";
import { canSeeCommercial, projectAccess } from "../projects/access";
import { expenseWhere, invoiceWhere } from "../finance/access";
import { employeeAccess } from "../hr/access";
import { requestWhere } from "./procurement";
import { poWhere } from "./orders";
import { ticketWhere } from "./support";
import { activeDriver, documentScanner, newStorageKey, sha256, storageFor, validateUpload } from "./storage";

/**
 * Document management (docs/OPERATIONS.md#documents).
 *
 * Access = the LINKED RECORD's own security + a classification tier. There is no broad "see every document"
 * permission: `documents.view` only opens the document center.
 *   level 0  no access to the record
 *   level 1  can see the record                         → PUBLIC_INTERNAL / INTERNAL documents
 *   level 2  can manage the record                      → CONFIDENTIAL
 *   level 3  sensitive tier of the record               → RESTRICTED  (e.g. employee salary files need HR compensation / payroll rights)
 * Unlinked (company) documents: PUBLIC_INTERNAL = every signed-in employee, INTERNAL = documents.view,
 * CONFIDENTIAL / RESTRICTED = documents.manage. PUBLIC_INTERNAL is never allowed on a linked record (DB CHECK).
 * The uploader (owner) always keeps access to their own document.
 */

export const REQUIRED: Record<DocumentClassification, number> = { PUBLIC_INTERNAL: 0, INTERNAL: 1, CONFIDENTIAL: 2, RESTRICTED: 3 };
export const DEFAULT_CATEGORY: Record<DocumentEntityType, string> = {
  CLIENT: "CLIENT", QUOTATION: "CONTRACT", CONTRACT: "CONTRACT", PROJECT: "PROJECT", INVOICE: "FINANCE", EXPENSE: "FINANCE", EMPLOYEE: "HR",
  VENDOR: "VENDOR", PROCUREMENT_REQUEST: "PROCUREMENT", PURCHASE_ORDER: "PROCUREMENT", ASSET: "ASSET", TICKET: "OTHER"
};

export type EntityRef = { type: DocumentEntityType; id: string };
type EntityAccess = { level: number; label: string; href: string };

const none: EntityAccess = { level: 0, label: "", href: "" };
const exists = async (p: Promise<unknown>) => Boolean(await p.catch(() => null));

/** Caller's access level to one record (0–3) + a label / link for display. */
export async function entityAccess(ctx: Ctx, ref: EntityRef): Promise<EntityAccess> {
  const org = ctx.organizationId;
  const id = ref.id;
  switch (ref.type) {
    case "CLIENT": {
      if (!can(ctx, "crm.clients.view")) return none;
      const c = await prisma.client.findFirst({ where: { id, organizationId: org, ...(await clientWhere(ctx)) }, select: { number: true, displayName: true } });
      if (!c) return none;
      return { level: can(ctx, "crm.clients.edit") ? 3 : 1, label: `${c.number} · ${c.displayName}`, href: `/app/crm/clients/${id}` };
    }
    case "QUOTATION": {
      if (!can(ctx, "sales.quotations.view")) return none;
      const q = await prisma.quotation.findFirst({ where: { id, organizationId: org, ...(await ownedWhere(ctx)) }, select: { number: true } });
      if (!q) return none;
      return { level: can(ctx, "sales.quotations.approve") ? 3 : can(ctx, "sales.quotations.edit") ? 2 : 1, label: q.number, href: `/app/sales/quotations/${id}` };
    }
    case "CONTRACT": {
      if (!can(ctx, "sales.contracts.view")) return none;
      const c = await prisma.contract.findFirst({ where: { id, organizationId: org, ...(await ownedWhere(ctx)) }, select: { number: true, title: true } });
      if (!c) return none;
      return { level: can(ctx, "sales.contracts.activate") ? 3 : can(ctx, "sales.contracts.edit") ? 2 : 1, label: `${c.number} · ${c.title}`, href: `/app/sales/contracts/${id}` };
    }
    case "PROJECT": {
      if (!can(ctx, "projects.view")) return none;
      const a = await projectAccess(prisma, ctx, id).catch(() => null);
      if (!a || (!a.manager && !a.member && !can(ctx, "projects.records.all"))) return a ? { level: 1, label: `${a.project.number} · ${a.project.name}`, href: `/app/projects/${id}` } : none;
      return { level: a.manager ? (canSeeCommercial(ctx) ? 3 : 2) : 1, label: `${a.project.number} · ${a.project.name}`, href: `/app/projects/${id}` };
    }
    case "INVOICE": {
      if (!can(ctx, "finance.invoices.view")) return none;
      const i = await prisma.invoice.findFirst({ where: { AND: [{ id, organizationId: org }, await invoiceWhere(ctx)] }, select: { number: true } });
      if (!i) return none;
      const all = can(ctx, "finance.records.all");
      return { level: all && can(ctx, "finance.invoices.issue") ? 3 : all ? 2 : 1, label: i.number ?? "Draft invoice", href: `/app/finance/invoices/${id}` };
    }
    case "EXPENSE": {
      const e = await prisma.expense.findFirst({ where: { AND: [{ id, organizationId: org }, expenseWhere(ctx)] }, select: { number: true } });
      if (!e) return none;
      return { level: can(ctx, "finance.expenses.approve") ? 3 : can(ctx, "finance.expenses.view") ? 2 : 1, label: e.number, href: `/app/finance/expenses/${id}` };
    }
    case "EMPLOYEE": {
      const a = await employeeAccess(prisma, ctx, id).catch(() => null);
      if (!a) return none;
      const e = await prisma.employee.findUniqueOrThrow({ where: { id }, select: { number: true, displayName: true } });
      const label = `${e.number} · ${e.displayName}`;
      const href = `/app/hr/employees/${id}`;
      // HR office: view → 1, personal data rights → 2, compensation / payroll rights → 3. A line manager gets nothing.
      const hr = a.rel.hr && can(ctx, "hr.employees.view") ? (canAny(ctx, "hr.compensation.view", "hr.payroll.view") && can(ctx, "hr.employees.sensitive") ? 3 : can(ctx, "hr.employees.sensitive") ? 2 : 1) : 0;
      return { level: Math.max(hr, a.rel.self ? 2 : 0), label, href };
    }
    case "VENDOR": {
      if (!canAny(ctx, "finance.vendors.view", "procurement.orders.view")) return none;
      const v = await prisma.vendor.findFirst({ where: { id, organizationId: org }, select: { number: true, name: true } });
      if (!v) return none;
      return { level: can(ctx, "finance.vendors.manage") ? 3 : 1, label: `${v.number} · ${v.name}`, href: `/app/procurement/vendors/${id}` };
    }
    case "PROCUREMENT_REQUEST": {
      const r = await prisma.procurementRequest.findFirst({ where: { AND: [{ id, organizationId: org }, await requestWhere(ctx)] }, select: { number: true, title: true, requesterId: true } });
      if (!r) return none;
      const approver = canAny(ctx, "procurement.requests.approve", "procurement.requests.approve_executive");
      return { level: approver ? 3 : r.requesterId === ctx.userId ? 2 : 1, label: `${r.number} · ${r.title}`, href: `/app/procurement/${id}` };
    }
    case "PURCHASE_ORDER": {
      const p = await prisma.purchaseOrder.findFirst({ where: { AND: [{ id, organizationId: org }, await poWhere(ctx)] }, select: { number: true } });
      if (!p) return none;
      return { level: can(ctx, "procurement.orders.approve") ? 3 : can(ctx, "procurement.orders.create") ? 2 : 1, label: p.number, href: `/app/procurement/orders/${id}` };
    }
    case "ASSET": {
      const a = await prisma.asset.findFirst({ where: { id, organizationId: org }, select: { number: true, name: true, assignedEmployee: { select: { userId: true } } } });
      if (!a) return none;
      const holder = a.assignedEmployee?.userId === ctx.userId;
      if (!can(ctx, "assets.view") && !holder) return none;
      return { level: can(ctx, "assets.manage") ? 3 : 1, label: `${a.number} · ${a.name}`, href: `/app/assets/${id}` };
    }
    case "TICKET": {
      const t = await prisma.supportTicket.findFirst({ where: { AND: [{ id, organizationId: org }, await ticketWhere(ctx)] }, select: { number: true, subject: true, assignedToId: true } });
      if (!t) return none;
      return { level: can(ctx, "support.tickets.manage") ? 3 : t.assignedToId === ctx.userId ? 2 : 1, label: `${t.number} · ${t.subject}`, href: `/app/support/tickets/${id}` };
    }
  }
}

/** Company documents (no linked record). */
const companyLevel = (ctx: Ctx) => (can(ctx, "documents.manage") ? 3 : can(ctx, "documents.view") ? 1 : 0);

type DocLite = Pick<Document, "id" | "ownerId" | "classification" | "entityType" | "entityId" | "status" | "reviewerId">;

/** One request-scoped resolver: entity access is computed once per record. */
export function accessResolver(ctx: Ctx) {
  const memo = new Map<string, Promise<EntityAccess>>();
  const of = (d: Pick<DocLite, "entityType" | "entityId">) => {
    if (!d.entityType || !d.entityId) return Promise.resolve<EntityAccess>({ level: companyLevel(ctx), label: "", href: "" });
    const k = `${d.entityType}:${d.entityId}`;
    if (!memo.has(k)) memo.set(k, entityAccess(ctx, { type: d.entityType, id: d.entityId }));
    return memo.get(k)!;
  };
  return {
    entity: of,
    async doc(d: DocLite) {
      const e = await of(d);
      // Phase 8 correction: for a record-linked document the RECORD's authorisation is authoritative — being the
      // uploader no longer keeps access after losing access to the record. Owner access remains for company documents.
      const owner = d.ownerId === ctx.userId && !d.entityType;
      const view = owner || (d.classification === "PUBLIC_INTERNAL" && !d.entityType) || e.level >= REQUIRED[d.classification];
      const manage = owner || e.level >= Math.max(2, REQUIRED[d.classification]);
      return { view, manage, reviewer: d.status === "IN_REVIEW" && d.reviewerId === ctx.userId, entity: e };
    }
  };
}

// --- create / version / archive -----------------------------------------------------------------

const metaSchema = z.object({
  title: reqText(2, 200),
  description: optText(2000),
  category: z.enum(["COMPANY", "CLIENT", "CONTRACT", "PROJECT", "FINANCE", "HR", "VENDOR", "PROCUREMENT", "ASSET", "LEGAL", "OTHER"]).optional(),
  entityType: z.preprocess((v) => (v === "" || v == null ? null : v), z.enum(["CLIENT", "QUOTATION", "CONTRACT", "PROJECT", "INVOICE", "EXPENSE", "EMPLOYEE", "VENDOR", "PROCUREMENT_REQUEST", "PURCHASE_ORDER", "ASSET", "TICKET"]).nullable()),
  entityId: optId,
  classification: z.enum(["PUBLIC_INTERNAL", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]).default("INTERNAL"),
  tags: z.preprocess((v) => (typeof v === "string" ? v.split(",") : v ?? []), z.array(z.string().trim().toLowerCase().max(40)).max(10)).transform((a) => [...new Set(a.filter(Boolean))]),
  reviewerId: optId,
  note: optText(500)
});

export type UploadedFile = { name: string; type: string; data: Buffer };

async function storeFile(organizationId: string, file: UploadedFile) {
  const v = validateUpload(file.name, file.type, file.data);
  if ("error" in v) throw invalid(v.error!);
  const scan = await documentScanner.scan(file.data, { mime: v.mime, name: v.name });
  if (scan === "INFECTED") throw invalid("FILE_REJECTED_BY_SCANNER");
  const key = newStorageKey(organizationId);
  const driver = activeDriver();
  await storageFor(driver).put(key, file.data);
  return { key, driver, sha: sha256(file.data), mime: v.mime, size: file.data.length, name: v.name, scan };
}

export async function createDocument(ctx: Ctx, raw: unknown, file: UploadedFile) {
  requirePermission(ctx, "documents.create");
  const input = metaSchema.parse(raw);
  if (Boolean(input.entityType) !== Boolean(input.entityId)) throw invalid("ENTITY_INCOMPLETE");
  if (input.classification === "PUBLIC_INTERNAL" && input.entityType) throw invalid("PUBLIC_INTERNAL_ONLY_COMPANY");
  // attaching to a record needs access to that record; company-wide (unlinked) documents are published by document managers only
  if (!input.entityType && !can(ctx, "documents.manage")) throw forbidden("documents.manage (company documents)");
  // you can only file a document where you could read it at that classification
  const e = input.entityType ? await entityAccess(ctx, { type: input.entityType, id: input.entityId! }) : { level: companyLevel(ctx) };
  if (input.entityType && e.level === 0) throw notFound("Linked record");
  if (e.level < REQUIRED[input.classification]) throw forbidden(`classification ${input.classification} on this record`);
  if (input.reviewerId && !(await prisma.user.findFirst({ where: { id: input.reviewerId, organizationId: ctx.organizationId, status: "ACTIVE" }, select: { id: true } }))) throw invalid("UNKNOWN_USER");
  const stored = await storeFile(ctx.organizationId, file);
  try {
    return await unitOfWork(ctx, async (tx, uow) => {
      const number = await nextNumber(tx, ctx.organizationId, "DOC");
      const d = await tx.document.create({
        data: {
          organizationId: ctx.organizationId, number, title: input.title, description: input.description ?? null, category: input.category ?? (input.entityType ? DEFAULT_CATEGORY[input.entityType] : "COMPANY") as never,
          entityType: input.entityType, entityId: input.entityId ?? null, ownerId: ctx.userId, classification: input.classification, tags: input.tags, currentVersion: 1,
          ...(input.reviewerId ? { status: "IN_REVIEW" as const, reviewerId: input.reviewerId, reviewRequestedAt: new Date() } : {}),
          versions: { create: { organizationId: ctx.organizationId, versionNumber: 1, storageKey: stored.key, storageDriver: stored.driver, sha256: stored.sha, mime: stored.mime, size: stored.size, originalName: stored.name, scanStatus: stored.scan, note: input.note ?? null, uploadedById: ctx.userId } }
        }
      });
      await uow.audit({ action: "document.created", entityType: "Document", entityId: d.id, after: { number, title: d.title, classification: d.classification, entity: input.entityType ? `${input.entityType}:${input.entityId}` : null, sha256: stored.sha, size: stored.size, mime: stored.mime } });
      uow.emit({ type: "document.version_created", entityType: "Document", entityId: d.id, payload: { documentId: d.id, number, version: 1, reviewerId: input.reviewerId ?? null, title: d.title } });
      return { id: d.id, number };
    });
  } catch (err) {
    await storageFor(stored.driver).remove(stored.key); // nothing references the object — do not leave orphans
    throw err;
  }
}

async function loadDoc(ctx: Ctx, id: string) {
  const d = await prisma.document.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!d) throw notFound("Document");
  const a = await accessResolver(ctx).doc(d);
  if (!a.view) throw notFound("Document"); // no existence leak
  return { d, a };
}

export async function addVersion(ctx: Ctx, id: string, file: UploadedFile, raw: unknown) {
  requirePermission(ctx, "documents.version");
  const { note } = z.object({ note: optText(500) }).parse(raw ?? {});
  const { d, a } = await loadDoc(ctx, id);
  if (!a.manage) throw forbidden("documents.version (document owner or record manager)");
  if (d.status === "ARCHIVED") throw conflict("DOCUMENT_ARCHIVED");
  const stored = await storeFile(ctx.organizationId, file);
  try {
    return await unitOfWork(ctx, async (tx, uow) => {
      await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${id} FOR UPDATE`;
      const cur = await tx.document.findUniqueOrThrow({ where: { id } });
      const versionNumber = cur.currentVersion + 1;
      // unique (documentId, versionNumber) is the backstop for concurrent uploads
      await tx.documentVersion.create({ data: { organizationId: ctx.organizationId, documentId: id, versionNumber, storageKey: stored.key, storageDriver: stored.driver, sha256: stored.sha, mime: stored.mime, size: stored.size, originalName: stored.name, scanStatus: stored.scan, note: note ?? null, uploadedById: ctx.userId } });
      await tx.document.update({ where: { id }, data: { currentVersion: versionNumber } });
      await uow.audit({ action: "document.version_uploaded", entityType: "Document", entityId: id, after: { version: versionNumber, sha256: stored.sha, size: stored.size, mime: stored.mime } });
      uow.emit({ type: "document.version_created", entityType: "Document", entityId: id, payload: { documentId: id, number: cur.number, version: versionNumber, title: cur.title } });
      return { version: versionNumber };
    });
  } catch (err) {
    await storageFor(stored.driver).remove(stored.key);
    if ((err as { code?: string }).code === "P2002") throw conflict("VERSION_CONFLICT_RETRY");
    throw err;
  }
}

export async function archiveDocument(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "documents.archive");
  const { reason } = z.object({ reason: reqText(3, 500) }).parse(raw);
  const { d, a } = await loadDoc(ctx, id);
  if (!a.manage) throw forbidden("documents.archive (document owner or record manager)");
  if (d.status === "ARCHIVED") return;
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.document.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date(), reviewerId: d.status === "IN_REVIEW" ? d.reviewerId : d.reviewerId } });
    await uow.audit({ action: "document.archived", entityType: "Document", entityId: id, before: { status: d.status }, after: { status: "ARCHIVED", reason } });
  });
}

export async function updateDocumentMeta(ctx: Ctx, id: string, raw: unknown) {
  const input = metaSchema.pick({ title: true, description: true, classification: true, tags: true }).parse(raw);
  const { d, a } = await loadDoc(ctx, id);
  if (!a.manage) throw forbidden("document owner or record manager");
  if (input.classification === "PUBLIC_INTERNAL" && d.entityType) throw invalid("PUBLIC_INTERNAL_ONLY_COMPANY");
  if (a.entity.level < REQUIRED[input.classification] && d.ownerId !== ctx.userId) throw forbidden(`classification ${input.classification}`);
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.document.update({ where: { id }, data: { title: input.title, description: input.description ?? null, classification: input.classification, tags: input.tags } });
    await uow.audit({ action: "document.updated", entityType: "Document", entityId: id, before: { title: d.title, classification: d.classification }, after: { title: input.title, classification: input.classification } });
  });
}

/** The named reviewer (or documents.manage) accepts a document under review. */
export async function approveDocumentReview(ctx: Ctx, id: string) {
  const { d, a } = await loadDoc(ctx, id);
  if (d.status !== "IN_REVIEW") throw conflict(`DOCUMENT_NOT_IN_REVIEW:${d.status}`);
  if (!a.reviewer && !can(ctx, "documents.manage")) throw forbidden("document reviewer");
  if (d.ownerId === ctx.userId) throw forbidden("self-review");
  return unitOfWork(ctx, async (tx, uow) => {
    const r = await tx.document.updateMany({ where: { id, status: "IN_REVIEW" }, data: { status: "ACTIVE" } });
    if (r.count !== 1) throw conflict("DOCUMENT_NOT_IN_REVIEW");
    await uow.audit({ action: "document.reviewed", entityType: "Document", entityId: id, before: { status: "IN_REVIEW" }, after: { status: "ACTIVE" } });
  });
}

/** Authorised download. Confidential / restricted downloads are audited; the stored hash is re-verified. */
export async function downloadDocument(ctx: Ctx, id: string, version?: number) {
  const { d } = await loadDoc(ctx, id);
  const v = await prisma.documentVersion.findFirst({ where: { documentId: id, versionNumber: version ?? d.currentVersion } });
  if (!v) throw notFound("DocumentVersion");
  // Phase 9: optional company policy — only CLEAN files may be downloaded (off by default; without a scanner nothing is CLEAN)
  if (process.env.REQUIRE_SCAN_BEFORE_DOWNLOAD === "true" && v.scanStatus !== "CLEAN") throw conflict(`SCAN_REQUIRED:${v.scanStatus}`);
  const data = await Promise.resolve()
    .then(() => storageFor(v.storageDriver).get(v.storageKey))
    .catch(() => null);
  if (!data) throw notFound("File");
  if (sha256(data) !== v.sha256) {
    await unitOfWork(ctx, (_tx, uow) => uow.audit({ action: "document.integrity_failed", entityType: "Document", entityId: id, after: { version: v.versionNumber, expected: v.sha256 } }));
    throw conflict("HASH_MISMATCH");
  }
  if (d.classification === "CONFIDENTIAL" || d.classification === "RESTRICTED") {
    await unitOfWork(ctx, (_tx, uow) => uow.audit({ action: "document.downloaded", entityType: "Document", entityId: id, after: { version: v.versionNumber, classification: d.classification } }));
  }
  return { data, mime: v.mime, name: v.originalName, sha256: v.sha256 };
}

// --- read ---------------------------------------------------------------------------------------

const listSchema = z.object({ q: z.string().trim().max(100).optional(), category: z.string().max(30).optional(), classification: z.string().max(30).optional(), status: z.string().max(20).optional(), review: z.string().optional() });

/**
 * Metadata search (title, description, number, tags) — no file content / OCR. Candidates are filtered
 * through the access resolver, so restricted documents never appear for people who cannot open them.
 */
export async function listDocuments(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "documents.view");
  const f = listSchema.parse(raw ?? {});
  const where: Prisma.DocumentWhereInput = {
    organizationId: ctx.organizationId,
    status: f.status === "archived" ? "ARCHIVED" : f.review === "1" ? "IN_REVIEW" : { not: "ARCHIVED" },
    ...(f.category ? { category: f.category as never } : {}),
    ...(f.classification ? { classification: f.classification as never } : {}),
    ...(f.review === "1" ? { reviewerId: ctx.userId } : {}),
    ...(f.q ? { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { description: { contains: f.q, mode: "insensitive" } }, { number: { contains: f.q.toUpperCase() } }, { tags: { has: f.q.toLowerCase() } }] } : {})
  };
  const candidates = await prisma.document.findMany({ where, orderBy: { updatedAt: "desc" }, take: 400 });
  const r = accessResolver(ctx);
  const out = [];
  for (const d of candidates) {
    const a = await r.doc(d);
    if (a.view) out.push({ ...d, entity: a.entity });
    if (out.length >= 100) break;
  }
  return out;
}

/** Documents attached to one record (entity pages). Returns null when the caller cannot see the record. */
export async function documentsFor(ctx: Ctx, ref: EntityRef) {
  const e = await entityAccess(ctx, ref);
  const docs = await prisma.document.findMany({ where: { organizationId: ctx.organizationId, entityType: ref.type, entityId: ref.id, status: { not: "ARCHIVED" } }, orderBy: { updatedAt: "desc" } });
  const r = accessResolver(ctx);
  const visible = [];
  for (const d of docs) if ((await r.doc(d)).view) visible.push(d);
  if (e.level === 0 && !visible.length) return null;
  return { docs: visible, canCreate: can(ctx, "documents.create") && e.level >= 1, level: e.level };
}

export async function getDocument(ctx: Ctx, id: string) {
  const { d, a } = await loadDoc(ctx, id);
  const versions = await prisma.documentVersion.findMany({ where: { documentId: id }, orderBy: { versionNumber: "desc" }, select: { id: true, versionNumber: true, sha256: true, mime: true, size: true, originalName: true, scanStatus: true, note: true, uploadedById: true, createdAt: true } });
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set([d.ownerId, d.reviewerId, ...versions.map((v) => v.uploadedById)].filter(Boolean) as string[])] } }, select: { id: true, name: true, nameAr: true } });
  return { doc: d, versions, people, access: a, can: { version: a.manage && can(ctx, "documents.version") && d.status !== "ARCHIVED", archive: a.manage && can(ctx, "documents.archive") && d.status !== "ARCHIVED", edit: a.manage && d.status !== "ARCHIVED", review: d.status === "IN_REVIEW" && d.ownerId !== ctx.userId && (a.reviewer || can(ctx, "documents.manage")) } };
}
