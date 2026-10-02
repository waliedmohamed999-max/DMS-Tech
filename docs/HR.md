# Business OS — People Operations (Phase 6): Employees, Attendance, Leave, Payroll, Recruitment, Performance

Internal people operations for DMS Tech. It holds employee records, attendance, leave, payroll runs, hiring and lightweight reviews.

It is **not** a statutory payroll engine. No Saudi labour-law, GOSI or tax rule is hard-coded. Every rule that varies by company is an explicit setting under `/app/hr/settings`. It is also **not** a document store: no files are uploaded, and the Documents tab is a placeholder.

## Routes

| Route | Purpose |
|---|---|
| `/app/hr` | People dashboard. Shows active employees, on leave today, present today, pending leave, open jobs, candidates in interviews, new hires this month and probation ending in ≤ 14 days. Also shows today's attendance, pending leave and the latest payroll status. All counts are limited to the viewer's HR scope. |
| `/app/hr/employees` | Directory with search and status / department / type filters, plus create (`?new=1`). The list query never selects personal contact details, salary or bank data. |
| `/app/hr/employees/[id]` | Profile with tabs: Overview, Employment, Attendance, Leave, Compensation 🔒, Payroll 🔒, Performance, Documents (placeholder) and Activity. Each tab is decided on the server from the viewer's relation to the employee (self / manager / HR) and their permissions. |
| `/app/hr/attendance` | Daily board (any date, department filter) and a manual record / correction form. |
| `/app/hr/leave` | Requests in scope (all / my team / mine). Includes cancellation, a request on behalf of an employee, and links into Approvals. |
| `/app/hr/payroll`, `/[id]` | Periods with totals. The period page holds calculate / recalculate, bonuses & deductions, submit / withdraw, mark paid, close, and the employee lines. |
| `/app/hr/payroll/entries/[id]/payslip` | Payslip PDF (`?lang=ar|en`), rendered from the frozen entry snapshot. |
| `/app/hr/recruitment` | Jobs and candidates (`?view=candidates`, `?new=candidate`). |
| `/app/hr/recruitment/jobs/[id]` | Pipeline board, one column per stage, with job status actions. |
| `/app/hr/recruitment/candidates/[id]` | Applications, interviews, evaluations and offers, including hire conversion. |
| `/app/hr/performance` | Reviews the viewer writes, their team's reviews, and reviews in the HR scope. |
| `/app/hr/settings` | Attendance & payroll policy, company holidays, leave types, opening balances and payroll components. |
| `/app/my-hr` | Self-service: check-in / out, month attendance, balances, leave requests (`?tab=leave&new=1`), payslips, reviews / goals and my interviews. |
| `/app/my-team` | Line-manager view of direct reports: today's status, pending and upcoming leave, open reviews. It never shows salary. |

## Data model (migration `20261003090000_phase6_people`, additive)

**Models.** The migration adds 21 tables:

| Area | Tables |
|---|---|
| Employees | `Employee` (`EMP-000001`, optional 1–1 `userId`, self-relation `managerId`) · `EmployeeCompensation` · `EmployeeBankAccount` |
| Attendance | `AttendancePolicy` (one per organization) · `CompanyHoliday` · `AttendanceRecord` (unique employee + date) |
| Leave | `LeaveType` · `LeaveLedgerEntry` · `LeaveRequest` |
| Payroll | `PayrollComponent` · `PayrollPeriod` · `PayrollEntry` (unique period + employee) · `PayrollAdjustment` |
| Recruitment | `JobOpening` (`JOB-`) · `Candidate` (`CAN-`) · `Application` (unique candidate + job) · `Interview` · `CandidateEvaluation` · `Offer` (`OFR-`) |
| Performance | `PerformanceReview` · `PerformanceGoal` |

`Department` is reused (it gains `active` plus the employee and job relations); there is no second department table.

**An employee is not a user.** An employee may have no system account. A user can be linked to at most one employee (unique). Hiring never creates an account; *Create system account* on the profile is a separate step that needs `admin.users.manage` and goes through the existing user service, temporary password included.

### Database guarantees

**CHECK constraints**
- An employee cannot be their own manager.
- A terminated employee has a termination date.
- Probation and termination dates are valid against the join date.
- First and last names are not blank.
- Compensation amounts are ≥ 0.
- IBAN format: `^[A-Z]{2}[0-9A-Z]{13,32}$`; a bank account's effective range is valid (to ≥ from).
- Attendance: check-out ≥ check-in.
- Leave: end ≥ start, days > 0.
- Ledger sign rules: days ≠ 0; USAGE < 0 and REVERSAL > 0, both tied to a leave request.
- Payroll period: end ≥ start.
- Payroll entry arithmetic: `gross = sum of earnings`, `net = gross − deductions`, `net ≥ 0`.
- Payroll adjustments are > 0 and carry a reason.
- Job, application and offer status rules; interview duration 5–600 min; ratings are 1–5; goal weight is 0–100.

**Partial unique indexes**
- One open compensation row per employee.
- One open bank account per employee.
- One ledger usage / reversal per leave request.
- One candidate per normalised email.
- One live offer per application.

**Triggers**
- `employee_no_manager_cycle` walks the chain and raises `MANAGER_CYCLE`. It backs up the service check, which runs under an advisory lock.
- `effective_history_guard` (compensation and bank): only `effectiveTo` may change on a stored row (`HISTORY_IMMUTABLE`), and effective ranges may not overlap (`PERIOD_OVERLAP`).
- `ledger_append_only` (`LEDGER_IMMUTABLE`): corrections are new entries.
- `payroll_period_guard`: lines and totals are frozen from APPROVED onward (`PAYROLL_FROZEN` / `PAYROLL_IMMUTABLE`).
- `payroll_child_guard`: entries and adjustments cannot change once the period is approved.

Trigger codes are surfaced as translated errors by `runAction`.

## Employees & manager hierarchy

**Lifecycle.** Status moves ACTIVE / PROBATION ↔ ON_LEAVE / SUSPENDED → TERMINATED → ARCHIVED. Terminating needs a date and a reason, and is refused while the employee still has direct reports (`HAS_DIRECT_REPORTS`).

**Reporting line.** `managerId` is validated on the server: no self, no cycle, and the manager must not be terminated or archived. A manager change is audited as `employee.manager_changed`.

**Visibility** (`employeeWhere`):
- `hr.records.all` + `hr.employees.view` → everyone.
- `hr.records.department` → the viewer's department.
- Otherwise: self and direct reports only.

**Personal contact data** (personal email / phone, emergency contact, nationality) is masked **on the server** (`maskEmail`, `maskPhone`). It is shown in clear only to self or to HR with `hr.employees.sensitive` covering the employee. The audit trail never stores it.

## Compensation & bank details

**Compensation history**
- `EmployeeCompensation` is effective-dated: base, housing, transport and other fixed allowance, plus currency.
- Adding a record closes the open one on the day before. A new record must start after the current one (`EFFECTIVE_DATE_NOT_AFTER_CURRENT`) and not before the join date.
- History rows are never edited; the trigger enforces this.
- Changes are audited as `compensation.created` / `compensation.changed` with monthly totals.
- Viewing needs `hr.compensation.view` plus HR scope; the employee may also see their own. Changing needs `hr.compensation.manage`, and never on your own record.
- A line manager **never** sees salary.

**Bank accounts**
- Bank details are always returned masked (`SA03 •••• •••• 7519`).
- *Reveal* needs `hr.bank.manage`. It is audited as `bank.revealed`, and the page hides the full IBAN again after 30 s.
- Changes are audited as `bank.changed` with the masked IBAN only.
- The CEO and GM roles do not get `hr.bank.*`.

**`UserCostRate` (Phase 5) is costing metadata, not salary.** Payroll never reads it, and compensation never feeds project costing.

## Attendance

**Policy.** `AttendancePolicy` holds the workday start / end, grace minutes, working days (default Sun–Thu, configurable), expected daily minutes, and these flags:

| Flag | Default |
|---|---|
| leave marks attendance | on |
| leave needs HR approval after the manager | off |
| payroll deducts approved unpaid leave | **off** |
| payroll prorates joiners / leavers | on |

`CompanyHoliday` rows remove days from the working calendar.

**Self check-in / out** (`hr.attendance.self`)
- Check-in is LATE after start + grace, or REMOTE when chosen.
- Check-out sets the worked minutes; a short day becomes HALF_DAY.
- A second check-in or check-out on the same day is refused, and a row lock prevents races.

**Manual records and corrections** (`hr.attendance.manage` within HR scope)
- Never allowed on your own record, and never for a future date.
- Correcting an existing day is audited (`attendance.corrected`) with before / after values.

**Approved leave** writes ON_LEAVE records (source LEAVE) when the policy says so. It never overwrites a real record. Cancelling the leave removes only future LEAVE rows.

**Missing attendance.** The sweep marks MISSING for active employees with an account and no record and no leave on the previous working day, and notifies them.

## Leave

**Types**
- Defaults: annual, sick, unpaid, emergency, other.
- **No balance is assumed.** `defaultBalanceDays` is a company setting; the demo seed sets annual = 21 as demo configuration.
- Types can be paid / unpaid, auto-approved (no approval required), or "requires attachment", which is recorded only.

**Ledger**
- `LeaveLedgerEntry` is append-only: OPENING (granted once per year and type, idempotently, under an advisory lock), ACCRUAL, ADJUSTMENT (signed, with a reason), USAGE and REVERSAL.
- Balance = sum of entries. Submitting also counts pending requests as reserved (`INSUFFICIENT_BALANCE`).

**Requests**
- Days are counted as working days from the company calendar.
- A request cannot cross the year end (`LEAVE_SPANS_YEARS`), cannot be empty (`NO_WORKING_DAYS`), and cannot overlap another request (`LEAVE_OVERLAP`).

**Approval routing** (approval type `LEAVE`)
1. The request goes to the direct manager's user when that user holds `approvals.decide` + `hr.leave.approve`. Otherwise it goes to HR (`hr.leave.manage`).
2. With `leaveRequiresHrApproval`, a second HR stage follows.
3. The decider is checked again on the server: the manager, or HR covering the employee. Never the employee themself.

**Approval effects.** Approval writes USAGE (and ON_LEAVE attendance). Cancelling an approved request writes REVERSAL. Everything is audited and emitted (`leave.submitted/approved/rejected/cancelled`), with notifications to the employee and the next approver.

## Payroll

**Lifecycle:** DRAFT → (calculate) REVIEW → submit → **Approval `PAYROLL`** → APPROVED → mark paid → PAID → CLOSED.

**Calculate** (`hr.payroll.prepare`)
1. Takes every employee active at some point in the period who has compensation effective in it. Employees without compensation are skipped and listed in the audit.
2. Snapshots name / number / job / department (English and Arabic, migration `20261004090000_phase6_payslip_dept_ar`) and the effective compensation into `PayrollEntry`.
3. Prorates by calendar days for joiners and leavers when the policy says so.
4. Adds the period's adjustments: bonuses / commission → bonuses, other earnings, deductions.
5. Deducts approved unpaid leave only when the policy flag is on.
6. Refuses a negative net (`NET_NEGATIVE`) and a currency mismatch (`CURRENCY_MISMATCH`).

Recalculating replaces the entries; the snapshot keeps payslips stable afterwards.

**Adjustments.** Each needs a reason and a positive amount, and is audited (`payroll.adjustment_changed`). Fixed components cannot be adjusted (`COMPONENT_NOT_ADJUSTABLE`). You cannot adjust your own pay. No adjustments are accepted while the period is in approval or frozen.

**Submit.** Refused when anything changed after the last calculation (`PAYROLL_STALE_RECALCULATE`).

**Approval**
- Needs `hr.payroll.approve` + `approvals.decide`.
- The approver may not be the preparer, calculator or submitter.
- The approver may not approve a payroll that carries a bonus or deduction for themselves (conflict of interest). Their regular, HR-managed salary being part of the company payroll does not block them; otherwise no employee could ever approve payroll.
- The approval is bound to `calculatedAt`, so a stale approval is refused.

**Mark paid** (`hr.payroll.pay`)
- A conditional update: it cannot run twice, and it cannot run before approval.
- The paid date cannot be in the future. A reference is optional.
- It records that the transfer happened outside the system; there is no bank integration.
- It emits `payroll.paid` with **totals only**, and every employee with an account gets a "payslip available" notification (deduplicated per entry).

**Visibility**
- Employee lines are shown only with `hr.payroll.view` or `prepare`.
- The Finance Manager (`approve` + `pay`, no `view`) sees totals and the workflow only.

**Payslip.** The PDF is AR / EN with bidi-safe numbers. It is rendered from the snapshot, never from current salary, and shows no bank or personal data. The employee can download their own once the period is PAID / CLOSED; otherwise `hr.payroll.view` is needed.

## Recruitment

**Jobs.** DRAFT → OPEN ↔ ON_HOLD → CLOSED / CANCELLED, with transitions enforced on the server. `job.opened` appears in the activity feed.

**Candidates.** Duplicate emails are blocked (`CANDIDATE_EXISTS`). A candidate can be added and applied to an open job in one step. There is no CV upload.

**Pipeline stages.** APPLIED → SCREENING → INTERVIEW → TECHNICAL → FINAL_INTERVIEW → OFFER → HIRED / REJECTED, as a fixed enum with server-enforced transitions.
- A stage move carries the stage the user saw, so a stale board is refused (`APPLICATION_STALE`).
- Rejection needs a reason.
- HIRED is reachable only through conversion.

**Interviews.** The schedule is stored only; no calendar invitation is sent. Interviewers are notified in the OS.

**Evaluations**
- Human 1–5 rating plus a recommendation. **No automatic scoring.**
- An interviewer who lacks recruitment permission sees a reduced candidate view, built on the server: their own interviews and evaluations only, no contact data, no salary expectation, no offers.

**Offers**
- One live offer per application.
- Submitting starts an Approval `OFFER` (`hr.offers.approve`); the author cannot approve their own offer.
- Approved offers are marked *given to the candidate*. The response (accepted / declined) is recorded manually with an explicit confirmation.
- Draft, approved and sent offers can be withdrawn.

**Hire conversion.** Runs once per accepted offer: a row lock plus unique `Offer.convertedEmployeeId` and `Application.hiredEmployeeId`.
- Creates the employee, with probation = start + 90 days.
- Optionally creates the starting compensation from the offer (needs `hr.compensation.manage`).
- Marks the application HIRED and withdraws the candidate's other active applications.
- Emits `employee.hired`.
- Creates **no** user account.

## Performance (lightweight)

- **Reviews** move DRAFT → IN_REVIEW → COMPLETED (rating 1–5 + summary required) → ACKNOWLEDGED by the employee. Completed reviews are final.
- **Goals** carry a title, weight, due date and status. The employee may move their own goals between not started and in progress; the manager or HR closes them.
- **Privacy.** The employee sees their own goals and only completed reviews. The manager, the reviewer and HR in scope see the rest.
- There are no OKRs, no 360° reviews and no AI.

## Permissions (Phase 6)

**Permission catalogue**
- Dashboard and scope: `hr.dashboard.view`, `hr.records.all`, `hr.records.department`.
- Employees: `hr.employees.view/create/edit/archive/sensitive`.
- Compensation and bank: `hr.compensation.view/manage`, `hr.bank.view/manage`.
- Attendance: `hr.attendance.view/manage/self`.
- Leave: `hr.leave.view/request/approve/manage`.
- Payroll: `hr.payroll.view/prepare/approve/pay`.
- Recruitment and performance: `hr.recruitment.view/manage`, `hr.offers.approve`, `hr.performance.view/manage`.

**Migrated permissions** (custom roles are migrated automatically):

| Old | New |
|---|---|
| `finance.payroll.view` | `hr.payroll.view` |
| `finance.payroll.manage` | `hr.payroll.view` + `prepare` |
| `hr.employees.manage` | `view/create/edit/archive` |

`hr.recruitment.manage` implies `view`.

| Role | People access |
|---|---|
| Everyone | `hr.attendance.self`, `hr.leave.request`; My HR |
| `line_manager` (new) | `approvals.decide`, `hr.leave.approve`, `hr.attendance.view`, `hr.performance.view/manage`, for direct reports only. No salary or bank. |
| `project_manager` | keeps `hr.leave.approve` (direct reports) |
| `hr_manager` | all `hr.*` except `payroll.approve/pay`, plus `approvals.decide` and `admin.departments.manage` |
| `finance_manager` | `hr.payroll.approve` + `hr.payroll.pay` (totals only; no employee lines) |
| `ceo` | all of HR except `hr.bank.*` |
| `general_manager` | HR read and approvals. No sensitive data, bank, compensation management, payroll preparation or payment. |

## Audit, events, notifications, sweep

**Audit.** Every mutation is audited with before / after values where relevant. This covers employee create, update and status; manager changes; compensation; bank changes and reveals; attendance records and corrections; leave; ledger adjustments; policy and holidays; payroll steps; recruitment; offers; hire; and performance.

**Events** (DomainEvent):

| Area | Events |
|---|---|
| Employees | `employee.created`, `employee.terminated`, `employee.hired`, `employee.manager_changed`, `employee.status_changed` |
| Leave | `leave.submitted`, `leave.approved`, `leave.rejected`, `leave.cancelled`, `leave.starting` |
| Attendance | `attendance.recorded`, `attendance.missing` |
| Payroll | `payroll.calculated`, `payroll.approved`, `payroll.paid` |
| Recruitment | `job.opened`, `candidate.applied`, `candidate.stage_changed`, `interview.scheduled`, `offer.approved`, `offer.sent`, `offer.accepted`, `offer.expiring` |
| Performance | `performance.review_due`, `performance.review_completed` |

**Activity feed.** Only non-sensitive events appear: employee created / terminated / hired, job opened, payroll paid (visible to `hr.payroll.pay`).

**Notifications.** Category HR, language-aware, deduplicated.

**Sweep.** Run `npm run hr:sweep` (it is also triggered at most every 5 minutes from the People dashboard and the Command Center). It is guarded by `JobLease` `sweep:hr:{org}`, and every signal is claimed once with a conditional update:
- missing attendance for the previous working day;
- leave starting within 2 days;
- reviews due within 7 days;
- sent offers expiring within 2 days.

The sweep never touches payroll.

## Finance integration

- Finance sees **Payroll paid (total)** on `/app/finance`, for the selected period, from `PayrollPeriod` totals with `finance.records.all`. It sees no employee-level amounts.
- Nothing is posted to a ledger; there is no GL in this phase.
- The "Salaries" expense category stays a category only. Paid payroll is not duplicated as expenses.

## Phase 7 boundary

Phase 7 has since added assets (employee Assets tab, offboarding signal) and secure documents (employee Documents tab, salary files restricted to HR compensation / payroll rights) — see [OPERATIONS.md](OPERATIONS.md). Still not built: accounting ledger, bank reconciliation, statutory payroll (GOSI / WPS files), calendar integrations, e-signature, NOVA internals.
