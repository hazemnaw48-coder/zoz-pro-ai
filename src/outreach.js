import { randomUUID } from "node:crypto";

export const OUTREACH_CHANNELS = ["email", "whatsapp", "linkedin", "phone", "other"];
export const OUTREACH_STATUSES = ["draft", "ready", "sent", "follow_up_due", "replied", "not_interested", "closed"];

function text(value, field, max = 1000) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return trimmed;
}

export function normalizeOutreachInput(input = {}) {
  const contactId = text(input.contactId, "contactId", 80);
  if (!contactId) throw new Error("contactId is required");

  const message = text(input.message, "message", 4000);
  if (!message) throw new Error("message is required");

  const followUpNumber = Number(input.followUpNumber ?? 1);
  if (!Number.isInteger(followUpNumber) || followUpNumber < 1 || followUpNumber > 10) {
    throw new Error("followUpNumber must be an integer from 1 to 10");
  }

  const channel = OUTREACH_CHANNELS.includes(input.channel) ? input.channel : "other";
  const status = OUTREACH_STATUSES.includes(input.status) ? input.status : "draft";

  return {
    id: text(input.id, "id", 80) || `OUT-${Date.now()}-${randomUUID().slice(0, 8)}`,
    contactId,
    opportunityId: text(input.opportunityId, "opportunityId", 80) || null,
    channel,
    status,
    followUpNumber,
    message,
    nextFollowUpAt: text(input.nextFollowUpAt, "nextFollowUpAt", 80) || null,
    lastAttemptAt: text(input.lastAttemptAt, "lastAttemptAt", 80) || null,
    notes: text(input.notes, "notes", 1500),
    createdAt: text(input.createdAt, "createdAt", 80) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
