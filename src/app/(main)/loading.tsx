import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

export default function MainLoading() {
  return (
    <div className="space-y-6 md:space-y-8">
      <Card className="p-4 md:p-6">
        <Skeleton className="mb-3 h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="col-span-2 h-24 md:col-span-1" />
        <Skeleton className="h-24" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
