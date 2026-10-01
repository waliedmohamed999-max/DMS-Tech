import { Skeleton } from "@/components/os/ui";

/** Shared skeleton for every OS page (keeps the shell stable, avoids layout shift). */
export default function Loading() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid gap-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="os-card grid gap-3 p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    </div>
  );
}
