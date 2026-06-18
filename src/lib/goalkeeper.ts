export function isGoalkeeperPosition(position?: string | null) {
  const value = (position ?? "")
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ");
  return (
    value === "g" ||
    value === "gk" ||
    value === "keeper" ||
    value === "goalkeeper" ||
    value === "goal keeper" ||
    value.includes("goal") ||
    value.includes("keeper") ||
    value.includes("goalie") ||
    value.includes("portero") ||
    value.includes("gardien") ||
    value.includes("torwart") ||
    value.includes("حارس")
  );
}

export const goalkeeperPositionWhere = {
  OR: [
    { position: { contains: "goal", mode: "insensitive" as const } },
    { position: { contains: "keeper", mode: "insensitive" as const } },
    { position: { contains: "goalie", mode: "insensitive" as const } },
    { position: { contains: "portero", mode: "insensitive" as const } },
    { position: { contains: "gardien", mode: "insensitive" as const } },
    { position: { contains: "torwart", mode: "insensitive" as const } },
    { position: { contains: "حارس", mode: "insensitive" as const } },
    { position: { equals: "G", mode: "insensitive" as const } },
    { position: { equals: "GK", mode: "insensitive" as const } },
    { position: { equals: "Keeper", mode: "insensitive" as const } },
  ],
};
