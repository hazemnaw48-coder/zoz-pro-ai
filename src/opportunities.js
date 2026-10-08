import { randomUUID } from "node:crypto";

export const OPPORTUNITY_STATUSES = ["new", "qualified", "watching", "won", "lost", "archived"];
export const INTELLIGENCE_TYPES = ["market", "competitor", "customer", "trend", "regulation", "technology", "other"];

function text(value, field, max = 500) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return trimmed;
}

function scorePart(value, field) {
  const number = Number(value ?? 0);
  if (!Number.isInteger(number) || number < 0 || number > 25) {
    throw new Error(`${field} must be an integer from 0 to 25`);
  }
  return number;
}

export function calculateOpportunityScore(input = {}) {
  const fit = scorePart(input.fit, "fit");
  const value = scorePart(input.value, "value");
  const urgency = scorePart(input.urgency, "urgency");
  const confidence = scorePart(input.confidence, "confidence");
  return fit + value + urgency + confidence;
}

export function normalizeOpportunityInput(input = {}) {
  const title = text(input.title, "title", 240);
  if (!title) throw new Error("title is required");

  const score = calculateOpportunityScore(input);

  return {
    id: text(input.id, "id", 80) || `OPP-${Date.now()}-${randomUUID().slice(0, 8)}`,
    title,
    description: text(input.description, "description", 2000),
    source: text(input.source, "source", 500),
    category: text(input.category, "category", 120),
    status: OPPORTUNITY_STATUSES.includes(input.status) ? input.status : "new",
    fit: scorePart(input.fit, "fit"),
    value: scorePart(input.value, "value"),
    urgency: scorePart(input.urgency, "urgency"),
    confidence: scorePart(input.confidence, "confidence"),
    score,
    owner: text(input.owner, "owner", 120) || "CEO/Manager",
    nextAction: text(input.nextAction, "nextAction", 500),
    createdAt: text(input.createdAt, "createdAt", 80) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeIntelligenceInput(input = {}) {
  const signal = text(input.signal, "signal", 1000);
  if (!signal) throw new Error("signal is required");

  const confidence = Number(input.confidence ?? 0);
  const relevance = Number(input.relevance ?? 0);
  if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
    throw new Error("confidence must be an integer from 0 to 100");
  }
  if (!Number.isInteger(relevance) || relevance < 0 || relevance > 100) {
    throw new Error("relevance must be an integer from 0 to 100");
  }

  return {
    id: text(input.id, "id", 80) || `INT-${Date.now()}-${randomUUID().slice(0, 8)}`,
    type: INTELLIGENCE_TYPES.includes(input.type) ? input.type : "other",
    signal,
    source: text(input.source, "source", 500),
    context: text(input.context, "context", 1500),
    confidence,
    relevance,
    score: Math.round((confidence + relevance) / 2),
    linkedOpportunityId: text(input.linkedOpportunityId, "linkedOpportunityId", 80) || null,
    createdAt: text(input.createdAt, "createdAt", 80) || new Date().toISOString(),
  };
}
