import { prisma } from "@/lib/prisma";

export async function hasUserSeenTutorial(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { hasSeenTutorial: true },
  });
  return user?.hasSeenTutorial ?? true;
}

export async function markTutorialSeen(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { hasSeenTutorial: true },
  });
}
