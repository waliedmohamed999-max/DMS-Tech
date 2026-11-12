import { Skeleton } from "@/components/os/ui";

/** Project detail skeleton: header, signal chips, tab strip, two-column body. */
export default function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true">
      <div className="flex flex-wrap items-start gap-3">
        <Skeleton className="size-8" />
        <div className="grid min-w-0 flex-1 gap-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:min-w-[220px]">
          <Skeleton className="h-3" />
          <Skeleton className="h-2" />
          <Skeleton className="h-8" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-6 w-28 rounded-full" />
        ))}
      </div>
      <div className="flex gap-1 overflow-hidden border-b border-os-line pb-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-5 w-20 shrink-0" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="os-card grid content-start gap-3 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
        <div className="os-card grid content-start gap-3 p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
    </div>
  );
}
