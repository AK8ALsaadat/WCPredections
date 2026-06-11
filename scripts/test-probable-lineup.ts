import "dotenv/config";
import { fetchProbableLineupFromApiFootball } from "../src/services/api-football-lineup.service";

async function main() {
  console.log("key:", !!process.env.API_FOOTBALL_KEY);

  for (const team of ["Mexico", "South Africa"]) {
    try {
      const lineup = await fetchProbableLineupFromApiFootball(team);
      console.log(
        team,
        lineup?.formation,
        lineup?.lineup?.map((p) => p.name).join(", ")
      );
    } catch (error) {
      console.error(team, error);
    }
  }
}

main();
