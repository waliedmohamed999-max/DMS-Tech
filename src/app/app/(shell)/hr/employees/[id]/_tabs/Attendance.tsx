import Link from "next/link";
import { attendanceMonth } from "@/server/hr/attendance";
import { attendanceTone } from "@/lib/os/hr-page";
import { recordAttendanceAction } from "@/lib/os/hr-actions";
import { Badge, SectionCard } from "@/components/os/ui";
import { ActionForm } from "@/components/hr/Forms";
import type { EmployeeTabCtx } from "./context";

export async function Attendance({ tc, employeeId, month, manage }: { tc: EmployeeTabCtx; employeeId: string; month?: string; manage: boolean }) {
  const { ctx, locale, t, today } = tc;
  const mm = /^\d{4}-\d{2}$/.test(month ?? "") ? month! : today.toISOString().slice(0, 7);
  const a = await attendanceMonth(ctx, employeeId, mm);
  const [y, mo] = mm.split("-").map(Number);
  const prev = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
  const days = Array.from({ length: a.to.getUTCDate() }, (_, i) => new Date(Date.UTC(y, mo - 1, i + 1)));
  const rec = new Map(a.records.map((r) => [r.date.toISOString().slice(0, 10), r]));
  const hol = new Set(a.holidays.map((h) => h.date.toISOString().slice(0, 10)));
  return (
    <SectionCard
      title={new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(a.from)}
      action={
        <span className="flex flex-wrap items-center gap-1">
          <Link href={`?tab=attendance&month=${prev}`} className="os-btn-ghost h-7 px-2 text-xs">‹</Link>
          <Link href={`?tab=attendance&month=${next}`} className="os-btn-ghost h-7 px-2 text-xs">›</Link>
          {manage && (
            <ActionForm
              action={recordAttendanceAction}
              trigger={t("a.recordAttendance")}
              triggerClass="os-btn-primary h-7 px-2 text-xs"
              submitLabel={t("save")}
              note={t("correctionNote")}
              fields={[
                { name: "employeeId", label: "", type: "hidden", value: employeeId },
                { name: "date", label: t("f.date"), type: "date", required: true, value: today.toISOString().slice(0, 10) },
                { name: "status", label: t("f.status"), type: "select", required: true, value: "PRESENT", options: ["PRESENT", "LATE", "REMOTE", "HALF_DAY", "ABSENT", "ON_LEAVE", "HOLIDAY", "MISSING"].map((s) => ({ value: s, label: t(`att.${s}` as "att.PRESENT") })) },
                { name: "checkIn", label: t("f.checkIn"), type: "time" },
                { name: "checkOut", label: t("f.checkOut"), type: "time" },
                { name: "notes", label: t("f.notes"), type: "textarea" }
              ]}
            />
          )}
        </span>
      }
    >
      <div className="grid grid-cols-7 gap-px bg-os-line text-center text-[11px]">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={`h${i}`} className="bg-os-panel py-1 text-os-muted">
            {new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + i)))}
          </div>
        ))}
        {Array.from({ length: a.from.getUTCDay() }, (_, i) => (
          <div key={`pad${i}`} className="bg-os-surface/40" />
        ))}
        {days.map((d0) => {
          const k = d0.toISOString().slice(0, 10);
          const r = rec.get(k);
          const working = a.workingDays.includes(k);
          return (
            <div key={k} className={`min-h-[54px] bg-os-surface px-1 py-1.5 ${!working ? "opacity-50" : ""}`} title={r?.notes ?? undefined}>
              <p className="text-os-faint">{d0.getUTCDate()}</p>
              {r ? <Badge tone={attendanceTone(r.status)}>{t(`att.${r.status}` as "att.PRESENT")}</Badge> : hol.has(k) ? <span className="text-iris-light">{t("holiday")}</span> : null}
              {r?.workMinutes ? <p className="mt-0.5 tabular text-os-muted" dir="ltr">{Math.floor(r.workMinutes / 60)}:{String(r.workMinutes % 60).padStart(2, "0")}</p> : null}
            </div>
          );
        })}
      </div>
      <p className="border-t border-os-line px-4 py-2 text-xs text-os-muted">
        {t("attTotals", { present: a.totals.present, late: a.totals.late, absent: a.totals.absent, missing: a.totals.missing, hours: Math.round(a.totals.minutes / 6) / 10 })}
      </p>
    </SectionCard>
  );
}
