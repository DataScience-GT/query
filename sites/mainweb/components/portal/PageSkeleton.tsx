import { Skeleton } from "@query/ui/Skeleton";
import { page } from "@query/ui/classes";

/** What a portal route shows while its segment loads: a headline and a few rows. */
export function PageSkeleton() {
  return (
    <div className={page} role="status" aria-label="Loading">
      <Skeleton className="h-10 w-2/3 max-w-md rounded-[var(--radius-sm)]" />
      <Skeleton className="mt-4 h-4 w-full max-w-xl rounded-[var(--radius-sm)]" />
      <div className="mt-10 space-y-4">
        <Skeleton className="h-20 w-full rounded-[var(--radius-md)]" />
        <Skeleton className="h-20 w-full rounded-[var(--radius-md)]" />
        <Skeleton className="h-20 w-full rounded-[var(--radius-md)]" />
      </div>
    </div>
  );
}
