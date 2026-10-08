import test from "node:test";
import assert from "node:assert/strict";
import { normalizeContactInput } from "../src/crm.js";

test("contact input requires a name and normalizes lifecycle status", () => {
  const contact = normalizeContactInput({
    name: "Amina Hassan",
    company: "Acme",
    role: "Marketing Director",
    status: "qualified",
    nextAction: "Book discovery call",
  });
  assert.match(contact.id, /^CNT-/);
  assert.equal(contact.status, "qualified");
  assert.equal(contact.nextAction, "Book discovery call");
  assert.throws(() => normalizeContactInput({ company: "Acme" }), /name is required/);
});

test("unsupported contact status defaults to lead", () => {
  assert.equal(normalizeContactInput({ name: "Test", status: "unknown" }).status, "lead");
});
