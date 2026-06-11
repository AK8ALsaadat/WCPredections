import { cn } from "@/lib/utils";

export function ErrorMessage({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
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
