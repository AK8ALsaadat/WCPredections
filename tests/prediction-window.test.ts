import test from "node:test";
import assert from "node:assert/strict";
import { isPredictionAllowed } from "../src/lib/utils";
import { shouldShowMatchInUpcomingList } from "../src/lib/tournament-gates";

test("allows predictions for today and tomorrow matches before kickoff lock", () => {
  const todayMatch = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const tomorrowMatch = new Date(Date.now() + 26 * 60 * 60 * 1000);
  const farFutureMatch = new Date(Date.now() + 80 * 60 * 60 * 1000);
  const lockedMatch = new Date(Date.now() + 5 * 60 * 1000);

  assert.equal(isPredictionAllowed(todayMatch, "SCHEDULED"), true);
  assert.equal(isPredictionAllowed(tomorrowMatch, "SCHEDULED"), true);
  assert.equal(isPredictionAllowed(farFutureMatch, "SCHEDULED"), false);
  assert.equal(isPredictionAllowed(lockedMatch, "SCHEDULED"), false);
});

test("shows knockout matches in upcoming list even when outside the prediction window", () => {
  const match = {
    matchTime: new Date(Date.now() + 80 * 60 * 60 * 1000),
    status: "SCHEDULED",
    isKnockout: true,
  };

  assert.equal(shouldShowMatchInUpcomingList(match), true);
});
