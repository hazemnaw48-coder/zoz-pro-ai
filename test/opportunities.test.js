import test from "node:test";
import assert from "node:assert/strict";
import { calculateOpportunityScore, normalizeOpportunityInput, normalizeIntelligenceInput } from "../src/opportunities.js";

test("opportunity score combines four bounded factors", () => {
  assert.equal(calculateOpportunityScore({ fit: 25, value: 20, urgency: 15, confidence: 10 }), 70);
  assert.throws(() => calculateOpportunityScore({ fit: 26, value: 0, urgency: 0, confidence: 0 }), /fit must be an integer/);
});

test("opportunity input is normalized with a durable id and total score", () => {
  const opportunity = normalizeOpportunityInput({
    title: "Enterprise SEO lead",
    source: "Inbound",
    fit: 25,
    value: 25,
    urgency: 20,
    confidence: 20,
    nextAction: "Qualify decision maker",
  });
  assert.equal(opportunity.score, 90);
  assert.equal(opportunity.status, "new");
  assert.match(opportunity.id, /^OPP-/);
});

test("intelligence signal requires bounded confidence and relevance", () => {
  const signal = normalizeIntelligenceInput({
    type: "market",
    signal: "Demand is increasing",
    source: "Manual research",
    confidence: 80,
    relevance: 60,
  });
  assert.equal(signal.score, 70);
  assert.match(signal.id, /^INT-/);
  assert.throws(() => normalizeIntelligenceInput({ signal: "x", confidence: 101, relevance: 1 }), /confidence must be/);
});
