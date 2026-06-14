import { cn } from "@/lib/utils";

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPagePrefetch?: (page: number) => void;
  className?: string;
  labels: {
    previous: string;
    next: string;
    pageOf: (page: number, total: number) => string;
  };
};

function buildPageList(page: number, totalPages: number): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, totalPages, page]);
  if (page > 1) pages.add(page - 1);
  if (page < totalPages) pages.add(page + 1);
  if (page > 2) pages.add(page - 2);
  if (page < totalPages - 1) pages.add(page + 2);

  return Array.from(pages).sort((a, b) => a - b);
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  onPagePrefetch,
  className,
  labels,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = buildPageList(page, totalPages);

  function goTo(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    onPageChange(nextPage);
  }

  return (
    <nav
      className={cn("flex flex-wrap items-center justify-center gap-2", className)}
      aria-label="pagination"
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => goTo(page - 1)}
        onMouseEnter={() => onPagePrefetch?.(page - 1)}
        onFocus={() => onPagePrefetch?.(page - 1)}
        onTouchStart={() => onPagePrefetch?.(page - 1)}
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
                aria-current={p === page ? "page" : undefined}
                onClick={() => goTo(p)}
                onMouseEnter={() => onPagePrefetch?.(p)}
                onFocus={() => onPagePrefetch?.(p)}
                onTouchStart={() => onPagePrefetch?.(p)}
                className={cn(
                  "min-w-9 rounded-lg border px-2 py-2 text-sm tabular-nums transition-colors",
                  p === page
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-card-border hover:border-primary/40 hover:bg-primary/5"
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
        onClick={() => goTo(page + 1)}
        onMouseEnter={() => onPagePrefetch?.(page + 1)}
        onFocus={() => onPagePrefetch?.(page + 1)}
        onTouchStart={() => onPagePrefetch?.(page + 1)}
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
