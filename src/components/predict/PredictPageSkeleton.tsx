import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

export function PredictPageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Skeleton className="h-4 w-24" />

      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="mx-auto mt-4 h-4 w-40" />
        <Skeleton className="mx-auto mt-4 h-10 w-full max-w-xs" />
      </Card>

      <Card>
        <Skeleton className="mb-4 h-6 w-32" />
        <div className="flex justify-center gap-4">
          <Skeleton className="h-16 w-20" />
          <Skeleton className="h-6 w-4 self-end" />
          <Skeleton className="h-16 w-20" />
        </div>
        <Skeleton className="mx-auto mt-6 h-12 w-full max-w-md" />
      </Card>

      <Card>
        <Skeleton className="mb-3 h-6 w-28" />
        <Skeleton className="h-10 w-full" />
      </Card>

      <Card>
        <Skeleton className="mb-4 h-6 w-36" />
        <Skeleton className="h-48 w-full" />
      </Card>

      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}
