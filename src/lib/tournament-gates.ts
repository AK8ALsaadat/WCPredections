import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isPredictionAllowed } from "@/lib/utils";

const GROUP_STAGE_GATE_REVALIDATE_SECONDS = 60;

async function computeGroupStageComplete(): Promise<boolean> {
  const where = {
    isKnockout: false,
    groupCode: { not: null },
  } as const;
  const [total, unfinished] = await Promise.all([
    prisma.match.count({ where }),
    prisma.match.count({
      where: {
        ...where,
        status: { not: "FINISHED" },
      },
    }),
  ]);

  return total > 0 && unfinished === 0;
}

export function isGroupStageComplete() {
  return unstable_cache(
    computeGroupStageComplete,
    ["group-stage-complete-v1"],
    {
      revalidate: GROUP_STAGE_GATE_REVALIDATE_SECONDS,
      tags: ["matches-schedule"],
    }
  )();
}

export async function canShowKnockoutFeatures() {
  return true;
}

export function shouldShowMatchInUpcomingList<T extends {
  isKnockout?: boolean;
  status?: string;
  matchTime: Date | string;
}>(match: T): boolean {
  if (match.status === "LIVE") return true;
  if (match.status && match.status !== "SCHEDULED") return false;

  if (match.isKnockout) return true;
  return isPredictionAllowed(match.matchTime, match.status);
}

export function filterVisibleMatches<T extends { isKnockout: boolean }>(
  matches: T[]
): T[] {
  return matches;
}
