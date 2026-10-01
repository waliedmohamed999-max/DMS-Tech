import { fmtMoney, fmtNumber } from "@/components/os/ui";

/** Horizontal bar list — pure CSS, values come straight from DB aggregates. */
export function BarList({ rows, locale, money, empty }: { rows: { key: string; label: string; value: number; sub?: string }[]; locale: string; money?: boolean; empty: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (max === 0) return <p className="px-4 py-8 text-center text-sm text-os-muted">{empty}</p>;
  return (
    <ul className="grid gap-3 p-4">
      {rows.map((r) => (
        <li key={r.key} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate text-os-muted">{r.label}</span>
            <span className="shrink-0 font-medium tabular" dir="ltr">
              {money ? fmtMoney(r.value, locale) : fmtNumber(r.value, locale)}
              {r.sub && <span className="ms-1.5 text-xs font-normal text-os-faint">{r.sub}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-os-raised">
            <div className="h-full rounded-full bg-gradient-to-r from-iris to-iris-light rtl:bg-gradient-to-l" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Funnel-style stage strip: one column per open stage, height ∝ count. */
export function StageColumns({ rows, locale, empty }: { rows: { key: string; label: string; count: number; value: number }[]; locale: string; empty: string }) {
  const max = Math.max(0, ...rows.map((r) => r.count));
  if (max === 0) return <p className="px-4 py-8 text-center text-sm text-os-muted">{empty}</p>;
  return (
    <div className="no-scrollbar flex items-end gap-2 overflow-x-auto p-4">
      {rows.map((r) => (
        <div key={r.key} className="flex min-w-[64px] flex-1 flex-col items-center gap-1.5">
          <span className="text-sm font-semibold tabular">{fmtNumber(r.count, locale)}</span>
          <div className="flex h-28 w-full items-end rounded-md bg-os-raised">
            <div className="w-full rounded-md bg-iris/70" style={{ height: `${r.count ? Math.max(6, (r.count / max) * 100) : 0}%` }} />
          </div>
          <span className="line-clamp-1 text-center text-[11px] text-os-muted">{r.label}</span>
          <span className="text-[10.5px] text-os-faint tabular" dir="ltr">
            {fmtMoney(r.value, locale)}
          </span>
        </div>
      ))}
    </div>
  );
}
