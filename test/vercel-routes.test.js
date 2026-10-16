import test from "node:test";
import assert from "node:assert/strict";

const entrypoints = [
  "api/[...path].js",
  "api/content-factory/status.js",
  "api/content-factory/publisher/status.js",
  "api/content-factory/publications.js",
  "api/content-factory/publications/[publicationId].js",
  "api/content-factory/publications/[publicationId]/submit.js",
  "api/executor/status.js",
  "api/executor/heartbeat.js",
  "api/control/commands.js",
  "api/control/commands/[commandId]/claim.js",
  "api/control/commands/[commandId]/complete.js",
  "api/control/commands/[commandId]/fail.js",
  "api/control/commands/[commandId]/cancel.js",
  "api/tasks/[taskId]/assign.js",
  "api/tasks/[taskId]/verify.js",
  "api/tasks/[taskId]/transition.js",
  "api/approvals/[approvalId]/approve.js",
  "api/approvals/[approvalId]/reject.js",
  "api/outreach/[outreachId]/status.js",
  "api/contacts/[contactId]/status.js",
  "api/opportunities/[opportunityId]/status.js"
];

test("every API path with multiple segments has an explicit native Vercel Function entrypoint", async () => {
  for (const file of entrypoints) {
    const module = await import(new URL(`../${file}`, import.meta.url));
    assert.equal(typeof module.default, "function", `${file} must export a handler`);
  }
});
