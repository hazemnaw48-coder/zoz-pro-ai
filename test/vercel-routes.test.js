import test from "node:test";
import assert from "node:assert/strict";

const entrypoints = [
  "api/[...path].js",
  "api/content-factory/status.js",
  "api/content-factory/publisher/status.js",
  "api/control/commands.js",
  "api/control/commands/[commandId]/cancel.js",
  "api/tasks/[taskId]/assign.js",
  "api/approvals/[approvalId]/approve.js",
  "api/approvals/[approvalId]/reject.js",
  "api/contacts/[contactId]/status.js",
  "api/opportunities/[opportunityId]/status.js"
];

test("all explicit deep API routes resolve to Vercel handlers within the Hobby function limit", async () => {
  assert.equal(entrypoints.length, 10, "three existing functions plus nine deep routes must stay at or below twelve");
  for (const file of entrypoints) {
    const module = await import(new URL(`../${file}`, import.meta.url));
    assert.equal(typeof module.default, "function", `${file} must export a handler`);
  }
});
