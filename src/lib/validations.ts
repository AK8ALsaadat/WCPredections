import { z } from "zod";

export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Username can only contain letters, numbers, and underscores"
  );

export const registerSchema = z.object({
  username: usernameSchema,
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password is too long"),
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const updateUsernameSchema = z.object({
  username: usernameSchema,
});

export const finishTypeSchema = z.enum([
  "NINETY_MINUTES",
  "EXTRA_TIME",
  "PENALTIES",
]);

export const predictionSchema = z
  .object({
    matchId: z.string().min(1),
    predHome: z.number().int().min(0).max(9),
    predAway: z.number().int().min(0).max(9),
    isDouble: z.boolean().optional().default(false),
    predictedFinishType: finishTypeSchema.optional().nullable(),
    predictedPenaltyWinnerTeamId: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.predictedFinishType === "PENALTIES") {
        return !!data.predictedPenaltyWinnerTeamId;
      }
      return true;
    },
    {
      message: "Penalty winner team is required when predicting penalties",
      path: ["predictedPenaltyWinnerTeamId"],
    }
  );

export const scorerPickSchema = z.object({
  playerId: z.string().min(1),
  goals: z.number().int().min(1).max(5),
});

export const scorerPredictionSchema = z.object({
  matchId: z.string().min(1),
  picks: z.array(scorerPickSchema).max(15),
});

export const boldScorerBetSchema = z.object({
  matchId: z.string().min(1),
  playerId: z.string().min(1).nullable(),
});

export const octopusGoalkeeperBetSchema = z.object({
  matchId: z.string().min(1),
  playerId: z.string().min(1).nullable(),
});

export const fullPredictionBundleSchema = predictionSchema.and(
  z.object({
    picks: z.array(scorerPickSchema).max(15).optional().default([]),
    boldPlayerId: z.string().min(1).nullable().optional().default(null),
    octopusPlayerId: z.string().min(1).nullable().optional().default(null),
  })
);

export type FullPredictionBundleInput = z.infer<
  typeof fullPredictionBundleSchema
>;

export const roundSchema = z.object({
  name: z.string().min(1).max(100),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

export const teamSchema = z.object({
  name: z.string().min(1).max(100),
  shortName: z.string().min(1).max(10),
  logoUrl: z.string().url().optional().nullable(),
  apiTeamId: z.string().optional().nullable(),
});

export const playerSchema = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1).max(100),
  apiPlayerId: z.string().optional().nullable(),
});

export const matchUpdateSchema = z.object({
  homeScore: z.number().int().min(0).optional().nullable(),
  awayScore: z.number().int().min(0).optional().nullable(),
  status: z
    .enum(["SCHEDULED", "LIVE", "FINISHED", "POSTPONED", "CANCELLED"])
    .optional(),
  isKnockout: z.boolean().optional(),
  actualFinishType: finishTypeSchema.optional().nullable(),
  penaltyWinnerTeamId: z.string().optional().nullable(),
  scorerPlayerIds: z.array(z.string()).optional(),
});

export const syncMatchesSchema = z.object({
  roundId: z.string().min(1),
  leagueId: z.string().optional(),
  season: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.errors.map((e) => e.message).join(", ");
    throw new Error(message);
  }
  return result.data;
}
