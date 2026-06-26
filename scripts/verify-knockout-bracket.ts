import { calculateKnockoutBracketPredictionPoints } from "../src/services/knockout-bracket-prediction.service";

function assert(name: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS: ${name}`);
}

const perfect = calculateKnockoutBracketPredictionPoints(
  {
    finalistOneTeamId: "team-b",
    finalistTwoTeamId: "team-a",
    championTeamId: "team-a",
  },
  { finalistTeamIds: ["team-a", "team-b"], championTeamId: "team-a" }
);

assert("two finalists and champion score 16", perfect.total === 16);
assert("finalist order does not matter", perfect.finalistOnePoints === 3);
assert("champion scores 10", perfect.championPoints === 10);

const partial = calculateKnockoutBracketPredictionPoints(
  {
    finalistOneTeamId: "team-a",
    finalistTwoTeamId: "team-c",
    championTeamId: "team-c",
  },
  { finalistTeamIds: ["team-a", "team-b"], championTeamId: "team-b" }
);

assert("wrong champion keeps correct finalist points", partial.total === 3);

const miss = calculateKnockoutBracketPredictionPoints(
  {
    finalistOneTeamId: "team-c",
    finalistTwoTeamId: "team-d",
    championTeamId: "team-c",
  },
  { finalistTeamIds: ["team-a", "team-b"], championTeamId: "team-a" }
);

assert("all wrong scores zero", miss.total === 0);
