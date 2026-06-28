import { shouldShowMatchInUpcomingList } from "@/lib/tournament-gates";

export const SCHEDULE_PAGE_SIZE = 12;

export type SchedulePageMeta = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageKind: "open" | "other";
  openCount: number;
};

type SchedulableMatch = {
  matchTime: Date | string;
  status?: string;
};

export function splitScheduleByPredictionWindow<T extends SchedulableMatch>(
  matches: T[]
): { open: T[]; other: T[] } {
  const open: T[] = [];
  const other: T[] = [];

  for (const match of matches) {
    const status = match.status ?? "SCHEDULED";
    if (status !== "SCHEDULED" && status !== "LIVE") {
      other.push(match);
      continue;
    }
    if (shouldShowMatchInUpcomingList(match)) {
      open.push(match);
    } else {
      other.push(match);
    }
  }

  return { open, other };
}

export function paginateSchedule<T extends SchedulableMatch>(
  matches: T[],
  page: number,
  pageSize = SCHEDULE_PAGE_SIZE
): { items: T[]; meta: SchedulePageMeta } {
  const safePage = Math.max(1, page);
  const { open, other } = splitScheduleByPredictionWindow(matches);

  if (open.length === 0) {
    const totalPages = Math.max(1, Math.ceil(other.length / pageSize));
    const clampedPage = Math.min(safePage, totalPages);
    const start = (clampedPage - 1) * pageSize;
    return {
      items: other.slice(start, start + pageSize),
      meta: {
        page: clampedPage,
        totalPages,
        totalItems: other.length,
        pageKind: "other",
        openCount: 0,
      },
    };
  }

  const openPages = Math.ceil(open.length / pageSize);
  const otherPages = Math.ceil(other.length / pageSize);
  const totalPages = openPages + otherPages;
  const clampedPage = Math.min(safePage, totalPages);

  if (clampedPage <= openPages) {
    const start = (clampedPage - 1) * pageSize;
    return {
      items: open.slice(start, start + pageSize),
      meta: {
        page: clampedPage,
        totalPages,
        totalItems: open.length + other.length,
        pageKind: "open",
        openCount: open.length,
      },
    };
  }

  const otherPage = clampedPage - openPages;
  const start = (otherPage - 1) * pageSize;
  return {
    items: other.slice(start, start + pageSize),
    meta: {
      page: clampedPage,
      totalPages,
      totalItems: open.length + other.length,
      pageKind: "other",
      openCount: open.length,
    },
  };
}
