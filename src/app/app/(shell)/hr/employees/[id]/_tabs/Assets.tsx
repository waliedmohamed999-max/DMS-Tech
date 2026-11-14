import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { employeeAssets } from "@/server/ops/assets";
import { Badge, fmtDate, SectionCard } from "@/components/os/ui";
import type { EmployeeTabCtx } from "./context";

export async function Assets({ tc }: { tc: EmployeeTabCtx }) {
  const { ctx, id, e, locale } = tc;
  const rows = await employeeAssets(ctx, id);
  const to = await getTranslations("os.ops");
  const open = rows.filter((r) => !r.returnedAt);
  return (
    <SectionCard title={`${to("assets")} · ${to("openN", { n: open.length })}`}>
      {["TERMINATED", "ARCHIVED"].includes(e.status) && open.length > 0 && <p className="border-b border-os-line bg-danger/10 px-4 py-2 text-xs text-danger">{to("returnRequired")}</p>}
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-os-muted">{to("noAssignments")}</p>
      ) : (
        <ul className="divide-y divide-os-line text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <Link href={`/app/assets/${r.asset.id}`} className="min-w-0 flex-1 truncate hover:text-iris-light">
                <span className="text-[11px] text-os-faint" dir="ltr">{r.asset.number}</span> {r.asset.name}
              </Link>
              {!r.returnedAt ? <Badge tone="info">{to("current")}</Badge> : <span className="text-[11px] text-os-faint">{to("returnedOn")} {fmtDate(r.returnedAt, locale)}</span>}
              <span className="text-[11px] text-os-faint">{fmtDate(r.assignedAt, locale)}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
