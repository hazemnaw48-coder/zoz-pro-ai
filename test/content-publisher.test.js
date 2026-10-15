import test from "node:test";
import assert from "node:assert/strict";
import {
  checkYouTubePublicationStatus,
  ContentPublisherError,
  getContentPublisherStatus,
  normalizeContentPublicationRequest,
  resolveStudioVideoUrl,
  submitYouTubePublication,
  verifyUploadPostAccount,
} from "../src/content-publisher.js";

const configuredEnv = () => ({
  UPLOAD_POST_API_KEY: "test-only-secret",
  UPLOAD_POST_PROFILE: "ZozAI2",
  ZOZ_PRO_MEDIA_CENTER_URL: "https://media-center.example.com",
  ZOZ_PRO_PUBLISHING_ENABLED: "true",
  ZOZ_PRO_MEDIA_CENTER_SELECTED: "true",
});

test("publisher readiness never exposes key values or claims a live verification", () => {
  const status = getContentPublisherStatus({ env: configuredEnv() });
  assert.equal(status.configured, true);
  assert.equal(status.canSubmit, true);
  assert.equal(status.verified, false);
  assert.equal(status.profileName, "ZozAI2");
  assert.equal(JSON.stringify(status).includes("test-only-secret"), false);
});

test("publisher is locked until an independent media center is selected", () => {
  const env = configuredEnv();
  delete env.ZOZ_PRO_MEDIA_CENTER_SELECTED;
  const status = getContentPublisherStatus({ env });
  assert.equal(status.configured, true);
  assert.equal(status.mediaCenterSelected, false);
  assert.equal(status.canSubmit, false);
  assert.equal(status.status, "disabled_no_media_center");
});

test("publisher makes no outbound request when no media center is selected", async () => {
  const env = configuredEnv();
  delete env.ZOZ_PRO_MEDIA_CENTER_SELECTED;
  let called = false;
  await assert.rejects(submitYouTubePublication({
    env, publication: { id: "PUB-test", jobId: "render_123", title: "Title", description: "Description", hashtags: [], privacyStatus: "unlisted" },
    fetchImpl: async () => { called = true; throw new Error("must not run"); },
  }), error => error instanceof ContentPublisherError && error.code === "media_center_not_selected");
  assert.equal(called, false);
});

test("publisher remains disabled without its explicit server feature switch", () => {
  const env = configuredEnv();
  delete env.ZOZ_PRO_PUBLISHING_ENABLED;
  const status = getContentPublisherStatus({ env });
  assert.equal(status.configured, true);
  assert.equal(status.canSubmit, false);
  assert.equal(status.status, "disabled_by_default");
});

test("studio source is derived from a trusted HTTPS origin and a safe job ID", () => {
  const env = configuredEnv();
  assert.equal(
    resolveStudioVideoUrl("render_123-ab", { env }),
    "https://media-center.example.com/outputs/render_123-ab/video.mp4",
  );
  assert.throws(() => resolveStudioVideoUrl("../secrets", { env }), ContentPublisherError);
  env.ZOZ_PRO_MEDIA_CENTER_URL = "http://media-center.example.com";
  assert.throws(() => resolveStudioVideoUrl("render_123", { env }), ContentPublisherError);
});

test("publication request validates title/privacy and normalizes tags", () => {
  const result = normalizeContentPublicationRequest({
    taskId: "ZP-009",
    jobId: "render_123",
    title: "Documentary",
    description: "About the pyramids",
    hashtags: "#الأهرامات, #مصر_القديمة",
  }, { env: configuredEnv() });
  assert.equal(result.privacyStatus, "unlisted");
  assert.deepEqual(result.hashtags, ["الأهرامات", "مصر_القديمة"]);
  assert.equal(result.sourceUrl, "https://media-center.example.com/outputs/render_123/video.mp4");
  assert.throws(() => normalizeContentPublicationRequest({
    taskId: "ZP-009", jobId: "render_123", title: "Documentary", description: "Description", privacyStatus: "publicly",
  }, { env: configuredEnv() }), ContentPublisherError);
});

test("verify Upload-Post account reads credentials server-side and does not expose them", async () => {
  let request;
  const result = await verifyUploadPostAccount({
    env: configuredEnv(),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ success: true, email: "service@example.com", plan: "Default" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(request.url, "https://api.upload-post.com/api/uploadposts/me");
  assert.equal(request.options.headers.Authorization, "Apikey test-only-secret");
  assert.equal(result.verified, true);
  assert.equal(JSON.stringify(result).includes("test-only-secret"), false);
});

test("publication uses the approved profile, source URL, async mode and idempotency key", async () => {
  const requests = [];
  const result = await submitYouTubePublication({
    env: configuredEnv(),
    publication: {
      id: "PUB-test-123",
      jobId: "render_123",
      title: "Pyramids documentary",
      description: "How were the pyramids built?",
      hashtags: ["الأهرامات", "#مصر_القديمة"],
      privacyStatus: "public",
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/uploadposts/me")) {
        return new Response(JSON.stringify({ success: true, email: "service@example.com", plan: "Default" }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, request_id: "zp_PUB-test-123", status: "queued" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
  });
  const request = requests[1];
  assert.equal(requests[0].url, "https://api.upload-post.com/api/uploadposts/me");
  assert.equal(request.url, "https://api.upload-post.com/api/upload");
  assert.equal(request.options.headers.Authorization, "Apikey test-only-secret");
  assert.equal(request.options.headers["Idempotency-Key"], "zoz-pro-zozpro_PUB-test-123");
  assert.equal(request.options.body.get("user"), "ZozAI2");
  assert.equal(request.options.body.get("platform[]"), "youtube");
  assert.equal(request.options.body.get("video"), "https://media-center.example.com/outputs/render_123/video.mp4");
  assert.equal(request.options.body.get("privacyStatus"), "public");
  assert.equal(request.options.body.get("async_upload"), "true");
  assert.equal(request.options.body.get("tags[]"), "الأهرامات");
  assert.equal(result.status, "queued");
  assert.equal(result.requestId, "zp_PUB-test-123");
});

test("disabled publishing never makes an outbound upload request", async () => {
  const env = configuredEnv();
  env.ZOZ_PRO_PUBLISHING_ENABLED = "false";
  let called = false;
  await assert.rejects(submitYouTubePublication({
    env,
    publication: { id: "PUB-test", jobId: "render_123", title: "Title", description: "Description", hashtags: [], privacyStatus: "unlisted" },
    fetchImpl: async () => { called = true; throw new Error("must not run"); },
  }), ContentPublisherError);
  assert.equal(called, false);
});

test("status polling confirms a public URL only when YouTube reports successful publication", async () => {
  const result = await checkYouTubePublicationStatus({
    env: configuredEnv(),
    requestId: "zp_PUB-test-123",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.upload-post.com/api/uploadposts/status?request_id=zp_PUB-test-123");
      assert.equal(options.headers.Authorization, "Apikey test-only-secret");
      return new Response(JSON.stringify({
        request_id: "zp_PUB-test-123",
        status: "completed",
        results: [{ platform: "youtube", success: true, url: "https://www.youtube.com/watch?v=test123" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(result.status, "published");
  assert.equal(result.postUrl, "https://www.youtube.com/watch?v=test123");
});
