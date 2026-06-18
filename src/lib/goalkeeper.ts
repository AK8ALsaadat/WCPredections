export function isGoalkeeperPosition(position?: string | null) {
  const value = (position ?? "").trim().toLowerCase();
  return (
    value === "g" ||
    value === "gk" ||
    value === "goalkeeper" ||
    value.includes("goal") ||
    value.includes("keeper")
  );
}

export const goalkeeperPositionWhere = {
  OR: [
    { position: { contains: "goal", mode: "insensitive" as const } },
    { position: { contains: "keeper", mode: "insensitive" as const } },
    { position: { equals: "G", mode: "insensitive" as const } },
    { position: { equals: "GK", mode: "insensitive" as const } },
  ],
};
