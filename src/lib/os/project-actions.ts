"use server";

import "@/server";
import { addProjectMember, changeProjectStatus, completeProject, createProject, removeProjectMember, updateProject } from "@/server/projects/projects";
import { addTaskComment, archiveTask, assignTask, changeTaskStatus, createMilestone, createTask, editComment, setMilestoneStatus, updateMilestone, updateTask } from "@/server/projects/work";
import { createTimeEntry, deleteTimeEntry, reopenApprovedEntry, submitTimesheet, updateTimeEntry, withdrawTimesheet } from "@/server/projects/time";
import { createDeliverable, createDependency, recordClientDecision, setDeliverableStatus, setDependencyStatus } from "@/server/projects/delivery";
import { saveTemplate } from "@/server/projects/templates";
import { runAction } from "./action";

/** Thin adapters — every service re-checks permission, project scope, membership and state. */
type R = Record<string, unknown>;

// Projects
export const createProjectAction = async (input: R) => runAction(async (ctx) => ({ id: (await createProject(ctx, input)).id }));
export const updateProjectAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateProject(ctx, id, input)));
export const projectStatusAction = async (id: string, to: string, reason?: string, from?: string) => runAction(async (ctx) => void (await changeProjectStatus(ctx, id, { to, reason, from })));
export const completeProjectAction = async (id: string, overrideReason?: string, from?: string) => runAction(async (ctx) => void (await completeProject(ctx, id, { overrideReason, from })));
export const addMemberAction = async (projectId: string, input: R) => runAction(async (ctx) => void (await addProjectMember(ctx, projectId, input)));
export const removeMemberAction = async (projectId: string, userId: string) => runAction((ctx) => removeProjectMember(ctx, projectId, userId));

// Milestones
export const createMilestoneAction = async (projectId: string, input: R) => runAction(async (ctx) => ({ id: (await createMilestone(ctx, projectId, input)).id }));
export const updateMilestoneAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateMilestone(ctx, id, input)));
export const milestoneStatusAction = async (id: string, to: string, reason?: string, from?: string) => runAction(async (ctx) => void (await setMilestoneStatus(ctx, id, { to, reason, from })));

// Tasks
export const createTaskAction = async (input: R) => runAction(async (ctx) => ({ id: (await createTask(ctx, input)).id }));
export const updateTaskAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateTask(ctx, id, input)));
export const assignTaskAction = async (id: string, assigneeId: string | null) => runAction(async (ctx) => void (await assignTask(ctx, id, assigneeId)));
export const taskStatusAction = async (id: string, to: string, opts: { from?: string; reason?: string; position?: number } = {}) => runAction(async (ctx) => void (await changeTaskStatus(ctx, id, { to, ...opts })));
export const archiveTaskAction = async (id: string) => runAction(async (ctx) => void (await archiveTask(ctx, id)));
export const commentAction = async (taskId: string, body: string) => runAction(async (ctx) => void (await addTaskComment(ctx, taskId, body)));
export const editCommentAction = async (commentId: string, body: string | null) => runAction(async (ctx) => void (await editComment(ctx, commentId, body)));

// Time
export const createTimeAction = async (input: R) => runAction(async (ctx) => void (await createTimeEntry(ctx, input)));
export const updateTimeAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateTimeEntry(ctx, id, input)));
export const deleteTimeAction = async (id: string) => runAction(async (ctx) => void (await deleteTimeEntry(ctx, id)));
export const submitTimesheetAction = async (projectId: string) => runAction((ctx) => submitTimesheet(ctx, projectId));
export const withdrawTimesheetAction = async (submissionId: string) => runAction(async (ctx) => void (await withdrawTimesheet(ctx, submissionId)));
export const reopenTimeAction = async (entryId: string, reason: string) => runAction(async (ctx) => void (await reopenApprovedEntry(ctx, entryId, reason)));

// Deliverables & dependencies
export const createDeliverableAction = async (projectId: string, input: R) => runAction(async (ctx) => void (await createDeliverable(ctx, projectId, input)));
export const deliverableStatusAction = async (id: string, to: string) => runAction(async (ctx) => void (await setDeliverableStatus(ctx, id, { to })));
export const clientDecisionAction = async (id: string, decision: "ACCEPTED" | "REJECTED", note: string) => runAction(async (ctx) => void (await recordClientDecision(ctx, id, { decision, note, confirm: true })));
export const createDependencyAction = async (projectId: string, input: R) => runAction(async (ctx) => void (await createDependency(ctx, projectId, input)));
export const dependencyStatusAction = async (id: string, to: string, note?: string) => runAction(async (ctx) => void (await setDependencyStatus(ctx, id, { to, note })));

// Templates
export const saveTemplateAction = async (input: R) => runAction((ctx) => saveTemplate(ctx, input));
