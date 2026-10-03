import { prisma } from "../db";
import { subscribe } from "../events/bus";
import { usersWithAll } from "../events/subscribers";
import { log } from "../obs/log";
import { reportError } from "../obs/errors";
import { jobHealth } from "./jobs";
import { checkStorage } from "./health";
import { appEnv } from "./environment";

/**
 * System alerts (docs/OBSERVABILITY.md#alerts). Evaluated by the worker (job "system:alerts") from REAL data.
 * Each alert notifies users holding system.health.view, deduplicated per alert kind per hour.
 * A database outage cannot be written to the database: it goes to the structured log + error reporter instead.
 */
export type Alert = { kind: string; severity: "HIGH" | "URGENT"; en: string; ar: string; href: string };

export async function evaluateAlerts(now = new Date()): Promise<Alert[]> {
  const out: Alert[] = [];
  const hourAgo = new Date(now.getTime() - 3600_000);
  const jobs = await jobHealth(now);
  const loop = jobs.find((j) => j.name === "worker:loop");
  // the worker is only "down" once it has existed (or is declared required) — a fresh install is NEVER_RUN, not down
  if (loop && (loop.state === "STUCK" || (loop.state !== "HEALTHY" && (loop.lastStartedAt || process.env.REQUIRE_WORKER === "1"))))
    out.push({ kind: "worker_down", severity: "URGENT", en: "Background worker is not heart-beating", ar: "العامل الخلفي متوقف (لا نبض)", href: "/app/admin/system-health?tab=jobs" });
  for (const j of jobs.filter((x) => x.name !== "worker:loop" && (x.state === "UNHEALTHY" || x.state === "STUCK")))
    out.push({ kind: `job:${j.name}`, severity: "HIGH", en: `Job ${j.name} is ${j.state.toLowerCase()}`, ar: `المهمة ${j.name} في حالة ${j.state === "STUCK" ? "توقف" : "فشل"}`, href: "/app/admin/system-health?tab=jobs" });

  const backlog = await prisma.integrationOutbox.count({ where: { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lt: new Date(now.getTime() - 15 * 60_000) } } });
  if (backlog > Number(process.env.ALERT_QUEUE_BACKLOG ?? 50)) out.push({ kind: "queue_backlog", severity: "HIGH", en: `Integration queue backlog: ${backlog} overdue items`, ar: `تراكم في طابور التكاملات: ${backlog} عنصرًا متأخرًا`, href: "/app/integrations/logs?view=retrying" });

  const [obDead, autoDead, evDead, evFailed] = await Promise.all([
    prisma.integrationOutbox.count({ where: { status: "DEAD_LETTER" } }),
    prisma.automationExecution.count({ where: { status: "DEAD_LETTER" } }),
    prisma.domainEvent.count({ where: { status: "DEAD_LETTER" } }),
    prisma.domainEvent.count({ where: { status: "FAILED", createdAt: { gte: hourAgo } } })
  ]);
  if (obDead + autoDead + evDead) out.push({ kind: "dead_letters", severity: "HIGH", en: `Dead letters need attention: ${obDead + autoDead + evDead}`, ar: `عناصر فشل نهائي تحتاج إجراء: ${obDead + autoDead + evDead}`, href: "/app/admin/system-health?tab=dead" });
  if (evFailed) out.push({ kind: "event_failures", severity: "HIGH", en: `${evFailed} domain events failed in the last hour`, ar: `${evFailed} أحداث فشلت خلال الساعة الأخيرة`, href: "/app/admin/system-health?tab=events" });

  const hooks = await prisma.webhookEvent.count({ where: { status: { in: ["REJECTED", "FAILED"] }, receivedAt: { gte: hourAgo } } });
  if (hooks >= Number(process.env.ALERT_WEBHOOK_FAILURES ?? 20)) out.push({ kind: "webhook_failures", severity: "HIGH", en: `${hooks} webhook deliveries rejected / failed in the last hour`, ar: `${hooks} تسليمات Webhook مرفوضة أو فاشلة خلال الساعة الأخيرة`, href: "/app/integrations/logs?view=webhooks" });

  const maxAgeH = Number(process.env.BACKUP_MAX_AGE_HOURS ?? 26);
  const lastBackup = await prisma.backupRecord.findFirst({ where: { kind: "database", status: { in: ["COMPLETED", "VERIFIED"] } }, orderBy: { startedAt: "desc" } });
  const backupExpected = ["production", "staging"].includes(appEnv()) || Boolean(lastBackup);
  if (backupExpected && (!lastBackup || now.getTime() - lastBackup.startedAt.getTime() > maxAgeH * 3600_000))
    out.push({ kind: "backup_stale", severity: "URGENT", en: lastBackup ? `Last database backup is older than ${maxAgeH} h` : "No database backup recorded", ar: lastBackup ? `آخر نسخة احتياطية أقدم من ${maxAgeH} ساعة` : "لا توجد نسخة احتياطية مسجلة", href: "/app/admin/system-health?tab=backups" });
  const failedBackup = await prisma.backupRecord.findFirst({ where: { status: { in: ["FAILED", "VERIFY_FAILED"] }, startedAt: { gte: new Date(now.getTime() - 24 * 3600_000) } } });
  if (failedBackup) out.push({ kind: "backup_failed", severity: "URGENT", en: "A backup or backup verification failed in the last 24 h", ar: "فشل نسخ احتياطي أو التحقق منه خلال 24 ساعة", href: "/app/admin/system-health?tab=backups" });

  const storage = await checkStorage();
  if (storage.status === "fail") out.push({ kind: "storage_failure", severity: "URGENT", en: `Document storage check failed (${storage.detail})`, ar: `فشل فحص تخزين المستندات (${storage.detail})`, href: "/app/admin/system-health" });
  return out;
}

/** Notify health viewers in every organization (dedupe: kind + hour). */
export async function raiseAlerts(alerts: Alert[], now = new Date()) {
  if (!alerts.length) return 0;
  const hour = now.toISOString().slice(0, 13);
  let n = 0;
  for (const org of await prisma.organization.findMany({ select: { id: true } })) {
    const ids = await usersWithAll(org.id, ["system.health.view"]);
    if (!ids.length) continue;
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, locale: true } });
    const r = await prisma.notification.createMany({
      data: alerts.flatMap((a) => users.map((u) => ({ organizationId: org.id, userId: u.id, category: "SYSTEM" as const, priority: a.severity, title: u.locale === "en" ? a.en : a.ar, href: a.href, dedupeKey: `alert:${a.kind}:${hour}` }))),
      skipDuplicates: true
    });
    n += r.count;
  }
  for (const a of alerts) log.warn("system_alert", { kind: a.kind, message: a.en });
  return n;
}

export async function alertTick(now = new Date()) {
  try {
    const alerts = await evaluateAlerts(now);
    return { alerts: alerts.map((a) => a.kind), notified: await raiseAlerts(alerts, now) };
  } catch (e) {
    // most likely the database itself — the only remaining channels are the log and the error reporter
    reportError(e, "system_alerts");
    throw e;
  }
}

export function registerSystemSubscribers() {
  subscribe("automation.execution_failed", async (e) => {
    const p = (e.payload ?? {}) as { rule?: string; code?: string; executionId?: string };
    const ids = await usersWithAll(e.organizationId, ["automation.executions.retry"]);
    if (!ids.length) return;
    const users = await prisma.user.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, select: { id: true, locale: true } });
    await prisma.notification.createMany({
      data: users.map((u) => ({ organizationId: e.organizationId, userId: u.id, category: "AUTOMATION" as const, priority: "HIGH" as const, title: u.locale === "en" ? `Business rule failed: ${p.rule ?? ""}` : `فشل تنفيذ قاعدة عمل: ${p.rule ?? ""}`, body: p.code ?? null, href: "/app/automation?tab=failed", entityType: "AutomationExecution", entityId: e.entityId ?? null, dedupeKey: `automation.failed:${e.entityId}` })),
      skipDuplicates: true
    });
  }, "system-automation-failed");
}
