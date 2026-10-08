import { randomUUID } from "node:crypto";

export const CONTACT_STATUSES = ["lead", "qualified", "active", "customer", "inactive", "lost"];

function text(value, field, max = 500) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return trimmed;
}

export function normalizeContactInput(input = {}) {
  const name = text(input.name, "name", 160);
  if (!name) throw new Error("name is required");

  return {
    id: text(input.id, "id", 80) || `CNT-${Date.now()}-${randomUUID().slice(0, 8)}`,
    name,
    company: text(input.company, "company", 200),
    role: text(input.role, "role", 160),
    email: text(input.email, "email", 320),
    phone: text(input.phone, "phone", 80),
    source: text(input.source, "source", 200),
    status: CONTACT_STATUSES.includes(input.status) ? input.status : "lead",
    linkedOpportunityId: text(input.linkedOpportunityId, "linkedOpportunityId", 80) || null,
    nextAction: text(input.nextAction, "nextAction", 500),
    notes: text(input.notes, "notes", 2000),
    owner: text(input.owner, "owner", 120) || "CEO/Manager",
    createdAt: text(input.createdAt, "createdAt", 80) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
