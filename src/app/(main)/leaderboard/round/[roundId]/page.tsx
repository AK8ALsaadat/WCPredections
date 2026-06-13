import { redirect } from "next/navigation";

// Regenerate round leaderboard every 60 seconds
export const revalidate = 60;

export default function RoundLeaderboardPage() {
  redirect("/leaderboard/overall");
}
