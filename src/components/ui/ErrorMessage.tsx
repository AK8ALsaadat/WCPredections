import { cn } from "@/lib/utils";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

export function ErrorMessage({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  if (!FEATURE_FLAGS.showNotifications) return null;
  return (
    <div
      className={cn(
        "rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger",
        className
      )}
    >
      {message}
    </div>
  );
}
