import test from "node:test";
import assert from "node:assert/strict";
import { getContentFactoryStatus } from "../src/content-factory.js";

test("content factory reports independent manual import and disabled publishing", () => {
  const result = getContentFactoryStatus({ state: { executor: { status: "offline" } }, env: {} });
  const byId = Object.fromEntries(result.connectors.map(item => [item.id, item]));
  assert.equal(result.phase, "independent_media_intake");
  assert.equal(result.overallStatus, "incomplete");
  assert.equal(byId["external-generator-tools"].status, "manual_export_import");
  assert.equal(byId["private-media-storage"].status, "not_configured");
  assert.equal(byId["claude-api"].status, "not_configured");
  assert.equal(byId["media-renderer"].status, "not_verified");
  assert.equal(byId["codex-executor"].status, "offline");
  assert.equal(byId.publishing.status, "disabled_pending_approval");
  assert.equal(byId["google-ai-studio-handoff"], undefined);
  assert.equal(byId["zoz-content-studio"], undefined);
});

test("configuration presence never implies a verified live integration", () => {
  const result = getContentFactoryStatus({
    state: { executor: { status: "online" } },
    env: { BLOB_READ_WRITE_TOKEN: "secret-storage-test", ZOZ_PRO_MEDIA_CENTER_URL: "https://media-center.invalid",
      ANTHROPIC_API_KEY: "secret-test-value", FFMPEG_PATH: "/usr/bin/ffmpeg" },
  });
  const byId = Object.fromEntries(result.connectors.map(item => [item.id, item]));
  assert.equal(byId["private-media-storage"].status, "configured_unverified");
  assert.equal(byId["private-media-storage"].verified, false);
  assert.equal(byId["external-generator-tools"].verified, false);
  assert.equal(byId["claude-api"].status, "configured_unverified");
  assert.equal(byId["claude-api"].verified, false);
  assert.equal(byId["media-renderer"].status, "configured_unverified");
  assert.equal(byId["media-renderer"].verified, false);
  assert.equal(byId["codex-executor"].status, "online");
  assert.equal(result.safety.outboundConnectionChecksPerformed, false);
  assert.equal(result.safety.externalGenerationApiCallsPerformed, false);
  assert.equal(result.safety.googleAIStudioConnected, false);
  assert.equal(result.projectBoundary.googleAIStudioConnection, "disabled");
  assert.equal(result.projectBoundary.legacyZoZAiMayBeModified, false);
  assert.equal(result.projectBoundary.automaticPublishing, false);
  assert.equal(JSON.stringify(result).includes("secret-storage-test"), false);
  assert.equal(JSON.stringify(result).includes("secret-test-value"), false);
  assert.equal(JSON.stringify(result).includes("https://media-center.invalid"), false);
});

test("legacy ZOZ AI stays out of scope and publishing remains disabled", () => {
  const result = getContentFactoryStatus({ state: { executor: { status: "online" } }, env: {} });
  assert.equal(result.projectBoundary.controllerRepository, "hazemnaw48-coder/zoz-pro-ai");
  assert.equal(result.projectBoundary.legacyZoZAi, "standby_and_out_of_scope");
  assert.equal(result.safety.secretsReturned, false);
  assert.equal(result.safety.publishingEnabled, false);
  assert.equal(result.safety.ownerApprovalRequiredForExternalSendOrProductionChanges, true);
  assert.ok(result.connectors.every(item => item.secretValuesExposed === false));
});
