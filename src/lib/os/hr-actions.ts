"use server";

import "@/server";
import { changeEmployeeStatus, createEmployee, createSystemAccount, linkUser, updateEmployee } from "@/server/hr/employees";
import { addCompensation, revealBankAccount, setBankAccount } from "@/server/hr/compensation";
import { addHoliday, recordAttendance, removeHoliday, savePolicy, selfCheck } from "@/server/hr/attendance";
import { adjustBalance, cancelLeaveRequest, createLeaveRequest, grantOpeningBalances, saveLeaveType, submitLeaveRequest } from "@/server/hr/leave";
import { addAdjustment, calculatePeriod, closePeriod, createPeriod, markPayrollPaid, removeAdjustment, submitPayroll, withdrawPayroll } from "@/server/hr/payroll";
import { addEvaluation, applyToJob, convertToEmployee, createCandidate, createJob, createOffer, moveStage, recordOfferResponse, scheduleInterview, sendOffer, setInterviewStatus, setJobStatus, submitOffer, updateJob, withdrawOffer } from "@/server/hr/recruitment";
import { acknowledgeReview, createGoal, createReview, updateGoal, updateReview } from "@/server/hr/performance";
import { runAction } from "./action";

/** Thin adapters — every HR service re-checks permission, HR scope and state on the server. */
type R = Record<string, unknown>;

// employees
export const createEmployeeAction = async (input: R) => runAction(async (ctx) => ({ id: (await createEmployee(ctx, input)).id }));
export const updateEmployeeAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateEmployee(ctx, id, input)));
export const employeeStatusAction = async (id: string, input: R) => runAction(async (ctx) => void (await changeEmployeeStatus(ctx, id, input)));
export const linkUserAction = async (id: string, userId: string | null) => runAction(async (ctx) => void (await linkUser(ctx, id, userId)));
export const createAccountAction = async (id: string, roleIds: string[]) => runAction(async (ctx) => ({ tempPassword: (await createSystemAccount(ctx, id, { roleIds })).tempPassword }));
export const addCompensationAction = async (id: string, input: R) => runAction(async (ctx) => void (await addCompensation(ctx, id, input)));
export const setBankAction = async (id: string, input: R) => runAction(async (ctx) => void (await setBankAccount(ctx, id, input)));
export const revealIbanAction = async (bankAccountId: string) => runAction(async (ctx) => (await revealBankAccount(ctx, bankAccountId)).iban, { revalidate: false });

// attendance
export const recordAttendanceAction = async (input: R) => runAction(async (ctx) => void (await recordAttendance(ctx, input)));
export const selfCheckAction = async (action: "in" | "out", remote = false) => runAction(async (ctx) => void (await selfCheck(ctx, action, { remote })));
export const savePolicyAction = async (input: R) => runAction(async (ctx) => void (await savePolicy(ctx, input)));
export const addHolidayAction = async (input: R) => runAction(async (ctx) => void (await addHoliday(ctx, input)));
export const removeHolidayAction = async (id: string) => runAction(async (ctx) => void (await removeHoliday(ctx, id)));

// leave
export const createLeaveAction = async (input: R) => runAction(async (ctx) => ({ id: (await createLeaveRequest(ctx, input)).id }));
export const submitLeaveAction = async (id: string) => runAction(async (ctx) => void (await submitLeaveRequest(ctx, id)));
export const cancelLeaveAction = async (id: string, reason?: string) => runAction(async (ctx) => void (await cancelLeaveRequest(ctx, id, { reason })));
export const saveLeaveTypeAction = async (input: R) => runAction(async (ctx) => void (await saveLeaveType(ctx, input)));
export const grantOpeningAction = async (year: number) => runAction(async (ctx) => (await grantOpeningBalances(ctx, year)).created);
export const adjustBalanceAction = async (input: R) => runAction(async (ctx) => void (await adjustBalance(ctx, input)));

// payroll
export const createPeriodAction = async (input: R) => runAction(async (ctx) => ({ id: (await createPeriod(ctx, input)).id }));
export const calculatePeriodAction = async (id: string) => runAction(async (ctx) => (await calculatePeriod(ctx, id)).skipped);
export const addAdjustmentAction = async (periodId: string, input: R) => runAction(async (ctx) => void (await addAdjustment(ctx, periodId, input)));
export const removeAdjustmentAction = async (id: string) => runAction(async (ctx) => void (await removeAdjustment(ctx, id)));
export const submitPayrollAction = async (id: string) => runAction(async (ctx) => void (await submitPayroll(ctx, id)));
export const withdrawPayrollAction = async (id: string) => runAction(async (ctx) => void (await withdrawPayroll(ctx, id)));
export const payPayrollAction = async (id: string, input: R) => runAction(async (ctx) => void (await markPayrollPaid(ctx, id, input)));
export const closePayrollAction = async (id: string) => runAction(async (ctx) => void (await closePeriod(ctx, id)));

// recruitment
export const createJobAction = async (input: R) => runAction(async (ctx) => ({ id: (await createJob(ctx, input)).id }));
export const updateJobAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateJob(ctx, id, input)));
export const jobStatusAction = async (id: string, to: "DRAFT" | "OPEN" | "ON_HOLD" | "CLOSED" | "CANCELLED") => runAction(async (ctx) => void (await setJobStatus(ctx, id, to)));
export const createCandidateAction = async (input: R) => runAction(async (ctx) => ({ id: (await createCandidate(ctx, input)).id }));
export const applyAction = async (candidateId: string, input: R) => runAction(async (ctx) => void (await applyToJob(ctx, candidateId, input)));
export const moveStageAction = async (applicationId: string, input: R) => runAction(async (ctx) => void (await moveStage(ctx, applicationId, input)));
export const scheduleInterviewAction = async (applicationId: string, input: R) => runAction(async (ctx) => void (await scheduleInterview(ctx, applicationId, input)));
export const interviewStatusAction = async (id: string, status: "COMPLETED" | "CANCELLED" | "NO_SHOW") => runAction(async (ctx) => void (await setInterviewStatus(ctx, id, status)));
export const evaluateAction = async (applicationId: string, input: R) => runAction(async (ctx) => void (await addEvaluation(ctx, applicationId, input)));
export const createOfferAction = async (applicationId: string, input: R) => runAction(async (ctx) => void (await createOffer(ctx, applicationId, input)));
export const submitOfferAction = async (id: string) => runAction(async (ctx) => void (await submitOffer(ctx, id)));
export const sendOfferAction = async (id: string) => runAction(async (ctx) => void (await sendOffer(ctx, id)));
export const offerResponseAction = async (id: string, input: R) => runAction(async (ctx) => void (await recordOfferResponse(ctx, id, input)));
export const withdrawOfferAction = async (id: string) => runAction(async (ctx) => void (await withdrawOffer(ctx, id)));
export const convertOfferAction = async (id: string, input: R) => runAction(async (ctx) => ({ id: (await convertToEmployee(ctx, id, input)).employeeId }));

// performance
export const createReviewAction = async (input: R) => runAction(async (ctx) => void (await createReview(ctx, input)));
export const updateReviewAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateReview(ctx, id, input)));
export const acknowledgeReviewAction = async (id: string) => runAction(async (ctx) => void (await acknowledgeReview(ctx, id)));
export const createGoalAction = async (input: R) => runAction(async (ctx) => void (await createGoal(ctx, input)));
export const updateGoalAction = async (id: string, input: R) => runAction(async (ctx) => void (await updateGoal(ctx, id, input)));
