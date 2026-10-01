import type { ProjectHealth } from "@/generated/prisma/client";
import type { Tx } from "../db";
import type { Uow } from "../events/bus";
import { todayIn } from "../commercial/dates";
import { isClosed } from "./access";

/**
 * Deterministic project PROGRESS and HEALTH (no AI, no randomness) — docs/PROJECTS.md.
 *
 * Progress (0–100) from weighted milestones (cancelled ones excluded):
 *   Σ weight(COMPLETED) + Σ weight(IN_PROGRESS|BLOCKED) × doneTasks/openOrDoneTasks of that milestone
 *   ─────────────────────────────────────────────────────────────────────────────────────────── × 100
 *                                   Σ weight(all non-cancelled)
 * Without milestones: done tasks ÷ non-cancelled tasks. Without either: 0.
 *
 * Health = AT_RISK if any reason has severity "risk", NEEDS_ATTENTION if any "attention",
 * otherwise HEALTHY. Every reason is stored with its cause so the UI never shows a bare colour:
 *   internal — the delivery team is late · client — we wait for the client · blocked — work is blocked
 *   schedule — the target date is threatened
 */

export type HealthReason = { code: string; severity: "risk" | "attention"; cause: "internal" | "client" | "blocked" | "schedule"; params: Record<string, string | number> };

type MilestoneIn = { id: string; title: string; status: string; weight: number; dueDate: Date; required: boolean };
type TaskIn = { id: string; milestoneId: string | null; status: string; priority: string; dueDate: Date | null; estimateMinutes: number | null; loggedMinutes: number };
type DepIn = { title: string; status: string; ownerSide: string; critical: boolean; dueDate: Date | null; requestedAt: Date };

const DAY = 86_400_000;
const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / DAY);
const OPEN_TASK = (s: string) => s !== "DONE" && s !== "CANCELLED";

export function computeProgress(milestones: MilestoneIn[], tasks: TaskIn[]) {
  const ms = milestones.filter((m) => m.status !== "CANCELLED");
  const live = tasks.filter((t) => t.status !== "CANCELLED");
  if (ms.length) {
    const total = ms.reduce((a, m) => a + m.weight, 0);
    let done = 0;
    for (const m of ms) {
      if (m.status === "COMPLETED") done += m.weight;
      else {
        // open milestone: partial credit for its finished tasks (also before the milestone is formally started)
        const mt = live.filter((t) => t.milestoneId === m.id);
        if (mt.length) done += (m.weight * mt.filter((t) => t.status === "DONE").length) / mt.length;
      }
    }
    return total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  }
  return live.length ? Math.round((live.filter((t) => t.status === "DONE").length / live.length) * 100) : 0;
}

export function computeHealth(input: {
  today: Date;
  status: string;
  targetEndDate: Date | null;
  lastActivityAt: Date;
  inactivityDays: number;
  progress: number;
  milestones: MilestoneIn[];
  tasks: TaskIn[];
  dependencies: DepIn[];
}): { health: ProjectHealth; reasons: HealthReason[] } {
  const r: HealthReason[] = [];
  if (isClosed(input.status) || input.status === "DRAFT") return { health: "HEALTHY", reasons: [] };
  const { today } = input;

  for (const m of input.milestones) {
    if (m.status === "COMPLETED" || m.status === "CANCELLED") continue;
    const late = daysBetween(today, m.dueDate);
    if (late > 0) r.push({ code: "MILESTONE_OVERDUE", severity: late > 7 ? "risk" : "attention", cause: "internal", params: { title: m.title, days: late } });
    if (m.status === "BLOCKED") r.push({ code: "MILESTONE_BLOCKED", severity: "attention", cause: "blocked", params: { title: m.title } });
  }
  const open = input.tasks.filter((t) => OPEN_TASK(t.status));
  const blocked = open.filter((t) => t.status === "BLOCKED").length;
  if (blocked) r.push({ code: "TASKS_BLOCKED", severity: blocked >= 3 ? "risk" : "attention", cause: "blocked", params: { count: blocked } });
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  const critical = overdue.filter((t) => t.priority === "URGENT" || t.priority === "HIGH").length;
  if (critical) r.push({ code: "CRITICAL_TASKS_OVERDUE", severity: critical >= 3 ? "risk" : "attention", cause: "internal", params: { count: critical } });
  const normal = overdue.length - critical;
  if (normal >= 3) r.push({ code: "TASKS_OVERDUE", severity: "attention", cause: "internal", params: { count: normal } });

  for (const d of input.dependencies) {
    if (d.status === "RESOLVED" || d.status === "CANCELLED") continue;
    const cause = d.ownerSide === "CLIENT" ? "client" : "internal";
    if (d.dueDate && d.dueDate < today) {
      const late = daysBetween(today, d.dueDate);
      r.push({ code: d.ownerSide === "CLIENT" ? "CLIENT_DEPENDENCY_OVERDUE" : "DEPENDENCY_OVERDUE", severity: d.critical && late > 7 ? "risk" : "attention", cause, params: { title: d.title, days: late } });
    } else if (!d.dueDate && daysBetween(today, d.requestedAt) > 14) {
      r.push({ code: "DEPENDENCY_WAITING_LONG", severity: "attention", cause, params: { title: d.title, days: daysBetween(today, d.requestedAt) } });
    }
  }

  if (input.targetEndDate) {
    const left = daysBetween(input.targetEndDate, today);
    if (left < 0) r.push({ code: "TARGET_DATE_PASSED", severity: "risk", cause: "schedule", params: { days: -left } });
    else if (left <= 7 && input.progress < 80) r.push({ code: "TARGET_DATE_NEAR", severity: input.progress < 50 ? "risk" : "attention", cause: "schedule", params: { days: left, progress: input.progress } });
  }

  const est = input.tasks.filter((t) => t.estimateMinutes && t.status !== "CANCELLED");
  const estimated = est.reduce((a, t) => a + (t.estimateMinutes ?? 0), 0);
  const logged = est.reduce((a, t) => a + t.loggedMinutes, 0);
  if (estimated > 0 && logged > estimated * 1.2) r.push({ code: "ESTIMATE_OVERRUN", severity: "attention", cause: "internal", params: { logged: Math.round(logged / 60), estimated: Math.round(estimated / 60) } });

  const idle = daysBetween(today, input.lastActivityAt);
  if (idle > input.inactivityDays && (input.status === "ACTIVE" || input.status === "AT_RISK")) r.push({ code: "NO_RECENT_ACTIVITY", severity: "attention", cause: "internal", params: { days: idle } });

  const health: ProjectHealth = r.some((x) => x.severity === "risk") ? "AT_RISK" : r.length ? "NEEDS_ATTENTION" : "HEALTHY";
  return { health, reasons: r };
}

/**
 * Recompute and store progress, health and client-dependency state of one project.
 * Called inside every project mutation (same transaction) and by the scheduled sweep.
 * Emits project.at_risk once per transition into AT_RISK (atRiskNotifiedAt guard).
 */
export async function recomputeProject(tx: Tx, projectId: string, uow?: Uow, now = new Date()) {
  const p = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, number: true, name: true, organizationId: true, status: true, targetEndDate: true, lastActivityAt: true, health: true, atRiskNotifiedAt: true, projectManagerId: true } });
  const org = await tx.organization.findUniqueOrThrow({ where: { id: p.organizationId }, select: { timezone: true, projectInactivityDays: true } });
  const [milestones, tasks, deps, logged] = [
    await tx.projectMilestone.findMany({ where: { projectId }, select: { id: true, title: true, status: true, weight: true, dueDate: true, required: true } }),
    await tx.task.findMany({ where: { projectId, archivedAt: null }, select: { id: true, milestoneId: true, status: true, priority: true, dueDate: true, estimateMinutes: true } }),
    await tx.projectDependency.findMany({ where: { projectId }, select: { title: true, status: true, ownerSide: true, critical: true, dueDate: true, requestedAt: true } }),
    await tx.timeEntry.groupBy({ by: ["taskId"], where: { projectId, status: { not: "REJECTED" }, taskId: { not: null } }, _sum: { minutes: true } })
  ];
  const tIn: TaskIn[] = tasks.map((t) => ({ ...t, loggedMinutes: logged.find((l) => l.taskId === t.id)?._sum.minutes ?? 0 }));
  const progress = computeProgress(milestones, tIn);
  const today = todayIn(org.timezone, now);
  const { health, reasons } = computeHealth({ today, status: p.status, targetEndDate: p.targetEndDate, lastActivityAt: p.lastActivityAt, inactivityDays: org.projectInactivityDays, progress, milestones, tasks: tIn, dependencies: deps });
  const clientOpen = deps.filter((d) => d.ownerSide === "CLIENT" && (d.status === "OPEN" || d.status === "WAITING"));
  const clientDependencyStatus = clientOpen.some((d) => d.dueDate && d.dueDate < today) ? "OVERDUE" : clientOpen.length ? "OPEN" : "NONE";
  const becameRisk = health === "AT_RISK" && !p.atRiskNotifiedAt;
  await tx.project.update({
    where: { id: projectId },
    data: { progress, health, healthReasons: reasons, healthCheckedAt: now, clientDependencyStatus, atRiskNotifiedAt: health === "AT_RISK" ? (p.atRiskNotifiedAt ?? now) : null }
  });
  if (becameRisk && uow) {
    uow.emit({ type: "project.at_risk", entityType: "Project", entityId: projectId, payload: { projectId, number: p.number, name: p.name, ownerId: p.projectManagerId, reasons: reasons.filter((x) => x.severity === "risk").map((x) => x.code) } });
  }
  return { progress, health, reasons, previousHealth: p.health };
}

/** Bump activity + recompute (call at the end of every project mutation). */
export async function touchProject(tx: Tx, projectId: string, uow?: Uow) {
  await tx.project.update({ where: { id: projectId }, data: { lastActivityAt: new Date() } });
  return recomputeProject(tx, projectId, uow);
}

