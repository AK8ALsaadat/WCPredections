import { Card } from "@/components/ui/Card";

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-card-border/40 ${className}`}
    />
  );
}

export default function DashboardLoading() {
  return (
    <div className="space-y-6 md:space-y-8">
      <Card className="p-4 md:p-6">
        <Skeleton className="mb-3 h-7 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="mt-4 flex gap-3">
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="col-span-2 h-24 md:col-span-1" />
        <Skeleton className="h-24" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
