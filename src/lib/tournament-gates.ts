import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

const GROUP_STAGE_GATE_REVALIDATE_SECONDS = 60;

async function computeGroupStageComplete(): Promise<boolean> {
  const groupMatches = await prisma.match.findMany({
    where: {
      isKnockout: false,
      groupCode: { not: null },
    },
    select: { status: true },
  });

  if (groupMatches.length === 0) return false;
  return groupMatches.every((match) => match.status === "FINISHED");
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
  return isGroupStageComplete();
}

export async function filterVisibleMatches<T extends { isKnockout: boolean }>(
  matches: T[]
): Promise<T[]> {
  if (await canShowKnockoutFeatures()) return matches;
  return matches.filter((match) => !match.isKnockout);
}
