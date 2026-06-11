import { cn } from "@/lib/utils";

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  labels: {
    previous: string;
    next: string;
    pageOf: (page: number, total: number) => string;
  };
};

export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
  labels,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) =>
      p === 1 ||
      p === totalPages ||
      (p >= page - 1 && p <= page + 1)
  );

  return (
    <nav
      className={cn("flex flex-wrap items-center justify-center gap-2", className)}
      aria-label="pagination"
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="rounded-lg border border-card-border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
      >
        {labels.previous}
      </button>

      <div className="flex items-center gap-1">
        {pages.map((p, idx) => {
          const prev = pages[idx - 1];
          const showEllipsis = prev != null && p - prev > 1;
          return (
            <span key={p} className="flex items-center gap-1">
              {showEllipsis && (
                <span className="px-1 text-muted">…</span>
              )}
              <button
                type="button"
                onClick={() => onPageChange(p)}
                className={cn(
                  "min-w-9 rounded-lg border px-2 py-2 text-sm tabular-nums",
                  p === page
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-card-border hover:border-primary/40"
                )}
              >
                {p}
              </button>
            </span>
          );
        })}
      </div>

      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="rounded-lg border border-card-border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
      >
        {labels.next}
      </button>

      <p className="w-full text-center text-xs text-muted sm:w-auto">
        {labels.pageOf(page, totalPages)}
      </p>
    </nav>
  );
}
