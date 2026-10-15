import test from "node:test";
import assert from "node:assert/strict";
import {
  MediaAssetError, createMediaUploadTicket, mediaManifestPath,
  mediaObjectPath, normalizeMediaMetadata, sanitizeMediaFilename,
} from "../src/media-assets.js";

test("media metadata accepts manually imported files from independent generators", () => {
  const metadata = normalizeMediaMetadata({
    assetId: "d93c1d8b-9c24-4e41-93d2-7c0a91d24f35",
    filename: "Episode 02 final.mp4", sourceSystem: "taaft", jobId: "render_02", title: "Fikra episode 02",
  });
  assert.equal(metadata.sourceSystem, "taaft");
  assert.equal(metadata.contentType, "video/mp4");
  assert.equal(metadata.safeFilename, "Episode_02_final.mp4");
  assert.equal(metadata.mediaRole, "final-video");
  assert.equal(mediaObjectPath(metadata), "zoz-pro-media/assets/d93c1d8b-9c24-4e41-93d2-7c0a91d24f35/Episode_02_final.mp4");
  assert.equal(mediaManifestPath(metadata.assetId), "zoz-pro-media/manifests/d93c1d8b-9c24-4e41-93d2-7c0a91d24f35.json");
});

test("media metadata rejects traversal, unsupported formats, unapproved sources and mismatched roles", () => {
  assert.equal(sanitizeMediaFilename("../../secret.mp4"), "secret.mp4");
  const assetId = "d93c1d8b-9c24-4e41-93d2-7c0a91d24f35";
  assert.throws(() => normalizeMediaMetadata({ assetId, filename: "video.exe", sourceSystem: "other" }), e => e instanceof MediaAssetError && e.code === "unsupported_media_type");
  assert.throws(() => normalizeMediaMetadata({ assetId, filename: "video.mp4", sourceSystem: "zoz-ai-private-db" }), e => e instanceof MediaAssetError && e.code === "unsupported_source_system");
  assert.throws(() => normalizeMediaMetadata({ assetId, filename: "video.mp4", sourceSystem: "google-ai-studio" }), e => e instanceof MediaAssetError && e.code === "unsupported_source_system");
  assert.throws(() => normalizeMediaMetadata({ assetId, filename: "video.mp4", sourceSystem: "gemini" }), e => e instanceof MediaAssetError && e.code === "unsupported_source_system");
  assert.throws(() => normalizeMediaMetadata({ assetId, filename: "video.mp4", sourceSystem: "other", mediaRole: "thumbnail" }), e => e instanceof MediaAssetError && e.code === "media_role_type_mismatch");
  assert.throws(() => normalizeMediaMetadata({ assetId, filename: "video.mp4", sourceSystem: "other", jobId: "../task" }), e => e instanceof MediaAssetError && e.code === "invalid_job_id");
});

test("upload ticket uses the owner-authenticated provider-neutral completion route", async () => {
  const fakeApi = {
    get: async () => null, put: async () => {}, issueSignedToken: async () => "test-token",
    presignUrl: async () => ({ presignedUrl: "https://storage.example/upload" }),
  };
  const ticket = await createMediaUploadTicket(
    { filename: "clip.mp4", sourceSystem: "digen-ai", title: "Test clip" },
    { blobApi: fakeApi, now: () => 1_800_000_000_000 },
  );
  assert.equal(ticket.completeEndpoint, "/api/content-factory/media/assets/" + ticket.assetId + "/complete");
  assert.equal(ticket.contentType, "video/mp4");
  assert.equal(ticket.method, "PUT");
  assert.equal(ticket.uploadUrl, "https://storage.example/upload");
});

test("upload ticket fails closed without private storage credentials", async () => {
  const previous = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    await assert.rejects(
      createMediaUploadTicket({ filename: "clip.mp4", sourceSystem: "other" }, { blobApi: null }),
      e => e instanceof MediaAssetError && e.code === "media_storage_not_configured" && e.httpStatus === 503,
    );
  } finally {
    if (previous === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previous;
  }
});
