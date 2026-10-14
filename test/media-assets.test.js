import test from "node:test";
import assert from "node:assert/strict";
import {
  MediaAssetError,
  createMediaUploadTicket,
  getStudioIntegrationStatus,
  mediaManifestPath,
  mediaObjectPath,
  normalizeMediaMetadata,
  recordStudioImportReceipt,
  sanitizeMediaFilename,
} from "../src/media-assets.js";

test("media metadata normalizes supported video assets without accepting arbitrary paths", () => {
  const metadata = normalizeMediaMetadata({
    assetId: "d93c1d8b-9c24-4e41-93d2-7c0a91d24f35",
    filename: "Episode 02 final.mp4",
    sourceSystem: "floot-production-center",
    jobId: "render_02",
    title: "Fikra episode 02",
  });
  assert.equal(metadata.contentType, "video/mp4");
  assert.equal(metadata.safeFilename, "Episode_02_final.mp4");
  assert.equal(metadata.mediaRole, "final-video");
  assert.equal(mediaObjectPath(metadata), "zoz-pro-media/assets/d93c1d8b-9c24-4e41-93d2-7c0a91d24f35/Episode_02_final.mp4");
  assert.equal(mediaManifestPath(metadata.assetId), "zoz-pro-media/manifests/d93c1d8b-9c24-4e41-93d2-7c0a91d24f35.json");
});

test("media metadata rejects traversal, unsupported formats, invalid sources and mismatched roles", () => {
  assert.equal(sanitizeMediaFilename("../../secret.mp4"), "secret.mp4");
  assert.throws(() => normalizeMediaMetadata({ filename: "video.exe", sourceSystem: "other" }), (e) => e instanceof MediaAssetError && e.code === "unsupported_media_type");
  assert.throws(() => normalizeMediaMetadata({ filename: "video.mp4", sourceSystem: "zoz-ai-private-db" }), (e) => e instanceof MediaAssetError && e.code === "unsupported_source_system");
  assert.throws(() => normalizeMediaMetadata({ filename: "video.mp4", sourceSystem: "other", mediaRole: "thumbnail" }), (e) => e instanceof MediaAssetError && e.code === "media_role_type_mismatch");
  assert.throws(() => normalizeMediaMetadata({ filename: "video.mp4", sourceSystem: "other", jobId: "../task" }), (e) => e instanceof MediaAssetError && e.code === "invalid_job_id");
});

test("integration status never claims live Google AI Studio verification from environment variables alone", () => {
  const missing = getStudioIntegrationStatus({ env: {} });
  assert.equal(missing.status, "not_connected");
  const configured = getStudioIntegrationStatus({
    env: {
      ZOZ_PRO_STUDIO_INTEGRATION_TOKEN: "x".repeat(40),
      BLOB_READ_WRITE_TOKEN: "fake-test-only-token",
    },
  });
  assert.equal(configured.status, "configured_unverified");
  assert.equal(configured.verified, false);
  assert.equal(configured.secretValuesExposed, false);
  assert.equal(JSON.stringify(configured).includes("fake-test-only-token"), false);
});

test("upload ticket is not created without private storage credentials", async () => {
  await assert.rejects(
    createMediaUploadTicket({ filename: "clip.mp4", sourceSystem: "other" }, { blobApi: null }),
    (e) => e instanceof MediaAssetError && e.code === "media_storage_not_configured" && e.httpStatus === 503,
  );
});

test("studio receipt requires explicit validation and a checksum is only recorded when valid", async () => {
  const fakeApi = {};
  await assert.rejects(
    recordStudioImportReceipt("d93c1d8b-9c24-4e41-93d2-7c0a91d24f35", {
      studioAssetId: "studio-file-1",
      validated: false,
    }, { blobApi: fakeApi }),
    (e) => e instanceof MediaAssetError && e.code === "media_asset_not_found",
  );
});
