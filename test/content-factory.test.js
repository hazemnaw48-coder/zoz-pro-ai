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
      ZOZ_CONTENT_STUDIO_TOKEN: "z".repeat(40),
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
  assert.equal(result.projectBoundary.legacyCredentialsMayBeReusedInZOZPro, false);
  assert.equal(result.projectBoundary.legacyVideoToolReuseMode, "kaggle_free_gpu_separate_authorization; paid_gpu_provider_remains_separate_or_explicit_asset_handoff");
  assert.equal(result.projectBoundary.ownerReportedVideoAllowance.amount, 30);
  assert.equal(result.projectBoundary.ownerReportedVideoAllowance.unit, "GPU-hours");
  assert.equal(result.projectBoundary.ownerReportedVideoAllowance.provider, "Kaggle");
  assert.equal(result.projectBoundary.ownerReportedVideoAllowance.providerIdentified, true);
  assert.equal(result.projectBoundary.ownerReportedVideoAllowance.actual_ZOZ_Pro_connection_verified, false);
  assert.equal(result.safety.legacyZoZAiConnectionsModified, false);
  assert.equal(result.projectBoundary.automaticPublishing, false);
  assert.equal(result.safety.secretsReturned, false);
  assert.equal(result.safety.publishingEnabled, false);
  assert.equal(result.safety.ownerApprovalRequiredForExternalSendOrProductionChanges, true);
  assert.ok(result.connectors.every((item) => item.secretValuesExposed === false));
});

test("Kaggle quota and RunPod image endpoint are distinct and disconnected", () => {
  const result = getContentFactoryStatus({ state: { executor: { status: "offline" } }, env: {} });
  const kaggle = result.connectors.find((item) => item.id === "kaggle-free-gpu");
  const runpod = result.connectors.find((item) => item.id === "runpod-legacy-image-endpoint");
  assert.ok(kaggle);
  assert.ok(runpod);
  assert.equal(kaggle.provider, "Kaggle");
  assert.equal(kaggle.status, "not_connected");
  assert.equal(kaggle.verified, false);
  assert.equal(kaggle.quota.amount, 30);
  assert.equal(kaggle.quota.period, "week");
  assert.equal(kaggle.legacyEvidence.kaggleEnvironmentVariablesObservedInZoZAiRailway, true);
  assert.equal(runpod.provider, "RunPod");
  assert.equal(runpod.status, "not_connected");
  assert.equal(runpod.capability, "image_generation_unverified_video");
  assert.match(runpod.detail, /does not prove that the configured RunPod endpoint supports video generation/);
});
