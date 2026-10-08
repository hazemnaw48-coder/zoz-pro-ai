import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOutreachInput } from "../src/outreach.js";

test("outreach requires a contact and message", () => {
  const item = normalizeOutreachInput({
    contactId: "CNT-1",
    channel: "whatsapp",
    message: "Hello, following up on our proposal.",
    followUpNumber: 2,
  });
  assert.match(item.id, /^OUT-/);
  assert.equal(item.status, "draft");
  assert.equal(item.followUpNumber, 2);
  assert.equal(item.channel, "whatsapp");
  assert.throws(() => normalizeOutreachInput({ message: "x" }), /contactId is required/);
  assert.throws(() => normalizeOutreachInput({ contactId: "CNT-1" }), /message is required/);
});

test("outreach follow-up number is bounded", () => {
  assert.throws(() => normalizeOutreachInput({ contactId: "CNT-1", message: "x", followUpNumber: 11 }), /followUpNumber/);
});
