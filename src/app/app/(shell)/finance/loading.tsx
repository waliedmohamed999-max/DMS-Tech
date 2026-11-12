import { Skeleton } from "@/components/os/ui";

/** Dashboard skeleton for this module: title, KPI cards, then a table-shaped list. */
export default function Loading() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid gap-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="os-card grid gap-3 p-4">
        <Skeleton className="h-8 w-64 max-w-full" />
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    </div>
  );
}
