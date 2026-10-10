import test from "node:test";
import assert from "node:assert/strict";
import { getContentFactoryStatus } from "../src/content-factory.js";

test("content factory defaults to conservative disconnected states", () => {
  const result = getContentFactoryStatus({ state: { executor: { status: "offline" } }, env: {} });
  const byId = Object.fromEntries(result.connectors.map((item) => [item.id, item]));

  assert.equal(result.phase, "connection_preparation");
  assert.equal(result.overallStatus, "incomplete");
  assert.equal(byId["zoz-content-studio"].status, "not_connected");
  assert.equal(byId["claude-api"].status, "not_configured");
  assert.equal(byId["media-renderer"].status, "not_verified");
  assert.equal(byId["codex-executor"].status, "offline");
  assert.equal(byId.publishing.status, "disabled_pending_approval");
});

test("configured values never imply a verified live integration", () => {
  const result = getContentFactoryStatus({
    state: { executor: { status: "online" } },
    env: {
      ZOZ_CONTENT_STUDIO_URL: "https://studio.invalid",
      ANTHROPIC_API_KEY: "secret-test-value",
      FFMPEG_PATH: "/usr/bin/ffmpeg",
    },
  });
  const byId = Object.fromEntries(result.connectors.map((item) => [item.id, item]));

  assert.equal(byId["zoz-content-studio"].status, "configured_unverified");
  assert.equal(byId["zoz-content-studio"].verified, false);
  assert.equal(byId["claude-api"].status, "configured_unverified");
  assert.equal(byId["claude-api"].verified, false);
  assert.equal(byId["media-renderer"].status, "configured_unverified");
  assert.equal(byId["media-renderer"].verified, false);
  assert.equal(byId["codex-executor"].status, "online");
  assert.equal(result.safety.outboundConnectionChecksPerformed, false);
  assert.equal(JSON.stringify(result).includes("secret-test-value"), false);
  assert.equal(JSON.stringify(result).includes("https://studio.invalid"), false);
});

test("legacy ZOZ AI stays out of scope and publishing remains disabled", () => {
  const result = getContentFactoryStatus({ state: { executor: { status: "online" } }, env: {} });

  assert.equal(result.projectBoundary.controllerRepository, "hazemnaw48-coder/zoz-pro-ai");
  assert.equal(result.projectBoundary.legacyZoZAiMayBeModified, false);
  assert.equal(result.projectBoundary.automaticPublishing, false);
  assert.equal(result.safety.secretsReturned, false);
  assert.equal(result.safety.publishingEnabled, false);
  assert.equal(result.safety.ownerApprovalRequiredForExternalSendOrProductionChanges, true);
  assert.ok(result.connectors.every((item) => item.secretValuesExposed === false));
});
