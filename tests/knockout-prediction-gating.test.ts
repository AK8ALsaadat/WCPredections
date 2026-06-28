import test from "node:test";
import assert from "node:assert/strict";
import { shouldGateKnockoutPredictions } from "../src/lib/tournament-gates.ts";

test("knockout predictions are not gated", () => {
  assert.equal(shouldGateKnockoutPredictions({ isKnockout: true }), false);
  assert.equal(shouldGateKnockoutPredictions({ isKnockout: false }), false);
});
