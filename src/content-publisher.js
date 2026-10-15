const UPLOAD_POST_API = "https://api.upload-post.com/api";

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function stringValue(value, field, maxLength, required = false) {
  if (value === undefined || value === null) {
    if (required) throw new ContentPublisherError("invalid_input", field + " is required.", 400);
    return "";
  }
  if (typeof value !== "string") {
    throw new ContentPublisherError("invalid_input", field + " must be a string.", 400);
  }
  const normalized = value.trim();
  if (required && !normalized) {
    throw new ContentPublisherError("invalid_input", field + " is required.", 400);
  }
  if (normalized.length > maxLength) {
    throw new ContentPublisherError("invalid_input", field + " exceeds " + maxLength + " characters.", 400);
  }
  return normalized;
}

export class ContentPublisherError extends Error {
  constructor(code, message, httpStatus = 502, details = null) {
    super(message);
    this.name = "ContentPublisherError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

/**
 * Configuration-only readiness: no network request and no secret values returned.
 * A configured API key is not treated as a verified account/profile.
 */
export function getContentPublisherStatus({ env = process.env } = {}) {
  const missingConfiguration = [];
  if (!hasValue(env.UPLOAD_POST_API_KEY)) missingConfiguration.push("UPLOAD_POST_API_KEY");
  if (!hasValue(env.UPLOAD_POST_PROFILE)) missingConfiguration.push("UPLOAD_POST_PROFILE");
  if (!hasValue(env.ZOZ_CONTENT_STUDIO_URL)) missingConfiguration.push("ZOZ_CONTENT_STUDIO_URL");

  const configured = missingConfiguration.length === 0;
  const mediaCenterSelected = env.ZOZ_PRO_MEDIA_CENTER_SELECTED === "true";
  const featureEnabled = env.ZOZ_PRO_PUBLISHING_ENABLED === "true";
  const canSubmit = configured && mediaCenterSelected && featureEnabled;
  const status = !configured
    ? "not_configured"
    : !mediaCenterSelected
      ? "disabled_no_media_center"
      : !featureEnabled
        ? "disabled_by_default"
        : "configured_unverified";

  return {
    id: "upload-post-youtube",
    provider: "Upload-Post",
    platform: "youtube",
    status,
    configured,
    featureEnabled,
    canSubmit,
    mediaCenterSelected,
    verified: false,
    profileName: hasValue(env.UPLOAD_POST_PROFILE) ? env.UPLOAD_POST_PROFILE.trim() : null,
    missingConfiguration,
    secretValuesExposed: false,
    detail: !configured
      ? "Publishing is not wired to this ZOZ Pro runtime. Missing server-side settings: " + missingConfiguration.join(", ") + ". No publishing request has been sent."
      : !mediaCenterSelected
        ? "Publishing is locked until the owner selects an independent media center and verifies its real file-delivery path. No publishing request has been sent."
        : !featureEnabled
          ? "Connector settings exist, but publishing is disabled by the ZOZ_PRO_PUBLISHING_ENABLED safety switch."
          : "Settings are present, but the API account/profile has not been verified from this runtime. Every publication still requires a matching owner-approved external-send approval.",
  };
}

export function resolveStudioVideoUrl(jobId, { env = process.env } = {}) {
  const safeJobId = stringValue(jobId, "jobId", 120, true);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(safeJobId)) {
    throw new ContentPublisherError("invalid_job_id", "jobId contains unsupported characters.", 400);
  }

  if (!hasValue(env.ZOZ_CONTENT_STUDIO_URL)) {
    throw new ContentPublisherError("studio_not_configured", "ZOZ_CONTENT_STUDIO_URL is not configured on the ZOZ Pro server.", 409);
  }

  let base;
  try {
    base = new URL(env.ZOZ_CONTENT_STUDIO_URL.trim());
  } catch {
    throw new ContentPublisherError("invalid_studio_url", "ZOZ_CONTENT_STUDIO_URL must be an absolute HTTPS origin.", 409);
  }

  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    (base.pathname !== "/" && base.pathname !== "")
  ) {
    throw new ContentPublisherError(
      "invalid_studio_url",
      "ZOZ_CONTENT_STUDIO_URL must be an HTTPS origin only, without credentials, query, fragment, or path.",
      409,
    );
  }

  return new URL("/outputs/" + safeJobId + "/video.mp4", base).toString();
}

export function normalizeContentPublicationRequest(input = {}, { env = process.env } = {}) {
  const taskId = stringValue(input.taskId, "taskId", 100, true);
  const jobId = stringValue(input.jobId, "jobId", 120, true);
  const title = stringValue(input.title, "title", 100, true);
  const description = stringValue(input.description, "description", 5000, true);
  const privacyStatus = input.privacyStatus === undefined ? "unlisted" : input.privacyStatus;

  if (!["public", "unlisted", "private"].includes(privacyStatus)) {
    throw new ContentPublisherError("invalid_privacy_status", "privacyStatus must be public, unlisted, or private.", 400);
  }

  let rawTags = input.hashtags === undefined || input.hashtags === null ? [] : input.hashtags;
  if (typeof rawTags === "string") rawTags = rawTags.split(/[,\n]/);
  if (!Array.isArray(rawTags)) {
    throw new ContentPublisherError("invalid_hashtags", "hashtags must be a list or comma-separated string.", 400);
  }
  if (rawTags.length > 30) {
    throw new ContentPublisherError("invalid_hashtags", "A maximum of 30 YouTube tags may be supplied.", 400);
  }

  const hashtags = [...new Set(rawTags.map((tag) => {
    if (typeof tag !== "string") {
      throw new ContentPublisherError("invalid_hashtags", "Each hashtag must be a string.", 400);
    }
    return tag.trim().replace(/^#+/, "").replace(/\s+/g, "").slice(0, 100);
  }).filter(Boolean))];

  return {
    taskId,
    jobId,
    title,
    description,
    hashtags,
    privacyStatus,
    sourceUrl: resolveStudioVideoUrl(jobId, { env }),
  };
}

function assertPublisherConfigured(env) {
  const status = getContentPublisherStatus({ env });
  if (!status.mediaCenterSelected) {
    throw new ContentPublisherError(
      "media_center_not_selected",
      "Publishing is locked until an independent media center and a verified file-delivery path are selected.",
      409,
    );
  }
  if (!status.configured) {
    throw new ContentPublisherError(
      "publisher_not_configured",
      "Upload-Post publishing is not configured in this ZOZ Pro runtime.",
      409,
      { missingConfiguration: status.missingConfiguration },
    );
  }
  if (!status.featureEnabled) {
    throw new ContentPublisherError(
      "publishing_disabled",
      "Publishing remains disabled. Enable it only after the server-side connector and source URL have been verified.",
      409,
    );
  }
}

function getUploadRequestId(publicationId) {
  const safeId = String(publicationId ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 150);
  if (!safeId) throw new ContentPublisherError("invalid_publication_id", "A valid publication ID is required.", 400);
  return "zozpro_" + safeId;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    throw new ContentPublisherError("provider_invalid_response", "Upload-Post returned a response that was not valid JSON.", 502);
  }
}

export async function verifyUploadPostAccount({ env = process.env, fetchImpl = fetch } = {}) {
  if (!hasValue(env.UPLOAD_POST_API_KEY)) {
    throw new ContentPublisherError("publisher_not_configured", "UPLOAD_POST_API_KEY is not configured on the ZOZ Pro server.", 409);
  }

  let response;
  try {
    response = await fetchImpl(UPLOAD_POST_API + "/uploadposts/me", {
      method: "GET",
      headers: { Authorization: "Apikey " + env.UPLOAD_POST_API_KEY.trim() },
    });
  } catch {
    throw new ContentPublisherError("provider_unreachable", "Could not reach Upload-Post to verify the configured credential.", 502);
  }

  const payload = await readJsonResponse(response);
  if (!response.ok || payload.success !== true) {
    const code = response.status === 401 ? "publisher_unauthorized" : "publisher_verification_failed";
    const status = response.status === 401 ? 401 : 502;
    throw new ContentPublisherError(code, payload.message || "Upload-Post credential verification failed.", status);
  }

  return {
    verified: true,
    provider: "Upload-Post",
    accountEmail: typeof payload.email === "string" ? payload.email : null,
    plan: typeof payload.plan === "string" ? payload.plan : null,
    profileName: hasValue(env.UPLOAD_POST_PROFILE) ? env.UPLOAD_POST_PROFILE.trim() : null,
    note: "This verifies the API key only; it does not publish a video or verify that the configured profile has YouTube access.",
  };
}

export async function submitYouTubePublication({ publication, env = process.env, fetchImpl = fetch } = {}) {
  assertPublisherConfigured(env);
  await verifyUploadPostAccount({ env, fetchImpl });
  if (!publication || typeof publication !== "object") {
    throw new ContentPublisherError("invalid_publication", "Publication details are required.", 400);
  }

  const jobId = stringValue(publication.jobId, "jobId", 120, true);
  const title = stringValue(publication.title, "title", 100, true);
  const description = stringValue(publication.description, "description", 5000, true);
  const privacyStatus = publication.privacyStatus;

  if (!["public", "unlisted", "private"].includes(privacyStatus)) {
    throw new ContentPublisherError("invalid_privacy_status", "A valid, explicitly stored YouTube privacy status is required.", 400);
  }

  const sourceUrl = resolveStudioVideoUrl(jobId, { env });
  const hashtags = Array.isArray(publication.hashtags) ? publication.hashtags : [];
  const cleanTags = [...new Set(hashtags
    .filter((tag) => typeof tag === "string")
    .map((tag) => tag.trim().replace(/^#+/, "").replace(/\s+/g, "").slice(0, 100))
    .filter(Boolean))].slice(0, 30);
  const visibleHashtags = cleanTags.map((tag) => "#" + tag).join(" ");
  const descriptionWithHashtags = visibleHashtags && !description.includes(visibleHashtags)
    ? description + "\n\n" + visibleHashtags
    : description;
  const requestId = getUploadRequestId(publication.id);

  const form = new FormData();
  form.append("user", env.UPLOAD_POST_PROFILE.trim());
  form.append("platform[]", "youtube");
  form.append("video", sourceUrl);
  form.append("title", title);
  form.append("description", descriptionWithHashtags);
  form.append("privacyStatus", privacyStatus);
  form.append("async_upload", "true");
  form.append("request_id", requestId);
  form.append("external_id", String(publication.id));
  form.append("youtubeContainsSyntheticMedia", "true");
  for (const tag of cleanTags) form.append("tags[]", tag);

  let response;
  try {
    response = await fetchImpl(UPLOAD_POST_API + "/upload", {
      method: "POST",
      headers: {
        Authorization: "Apikey " + env.UPLOAD_POST_API_KEY.trim(),
        "Idempotency-Key": "zoz-pro-" + requestId,
      },
      body: form,
    });
  } catch {
    // The request may have reached the provider before the connection failed.
    // Reconcile this known request_id; do not auto-resubmit.
    return {
      status: "needs_reconciliation",
      requestId,
      postUrl: null,
      providerStatus: "network_outcome_unknown",
      message: "The upload request outcome is unknown. Check its request ID before attempting another submission.",
    };
  }

  const payload = await readJsonResponse(response);
  if (!response.ok || payload.success === false) {
    const code = response.status === 429 ? "publisher_quota_or_rate_limit" :
      response.status === 401 ? "publisher_unauthorized" :
        response.status === 403 ? "publisher_plan_restriction" : "publisher_rejected";
    throw new ContentPublisherError(
      code,
      payload.message || payload.error || ("Upload-Post rejected the video request (HTTP " + response.status + ")."),
      response.status === 429 ? 429 : response.status === 401 ? 401 : response.status === 403 ? 403 : 502,
      payload.usage && typeof payload.usage === "object" ? {
        count: payload.usage.count,
        limit: payload.usage.limit,
        lastReset: payload.usage.last_reset,
      } : null,
    );
  }

  if (hasValue(payload.request_id)) {
    return {
      status: "queued",
      requestId: payload.request_id,
      postUrl: null,
      providerStatus: payload.status || "queued",
      message: "Upload-Post accepted the request. The YouTube result must be checked before declaring publication successful.",
    };
  }

  const youtubeResult = Array.isArray(payload.results)
    ? payload.results.find((item) => item?.platform === "youtube")
    : payload.results?.youtube;

  if (youtubeResult?.success === true && hasValue(youtubeResult.url)) {
    return {
      status: "published",
      requestId: null,
      postUrl: youtubeResult.url,
      providerStatus: "completed",
      message: "Upload-Post returned a successful YouTube result with a post URL.",
    };
  }

  throw new ContentPublisherError(
    "publisher_response_unverified",
    "Upload-Post accepted a response without a request ID or a verified YouTube post URL. Reconcile the result before retrying.",
    502,
  );
}

export async function checkYouTubePublicationStatus({ requestId, env = process.env, fetchImpl = fetch } = {}) {
  if (!hasValue(env.UPLOAD_POST_API_KEY)) {
    throw new ContentPublisherError("publisher_not_configured", "UPLOAD_POST_API_KEY is not configured on the ZOZ Pro server.", 409);
  }
  const id = stringValue(requestId, "requestId", 200, true);
  const url = new URL(UPLOAD_POST_API + "/uploadposts/status");
  url.searchParams.set("request_id", id);

  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Authorization: "Apikey " + env.UPLOAD_POST_API_KEY.trim() },
    });
  } catch {
    throw new ContentPublisherError("provider_unreachable", "Could not retrieve the Upload-Post request status.", 502);
  }

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new ContentPublisherError(
      response.status === 404 ? "publisher_request_not_found" : "publisher_status_failed",
      payload.message || payload.error || ("Upload-Post status request failed (HTTP " + response.status + ")."),
      response.status === 404 ? 404 : 502,
    );
  }

  const providerStatus = typeof payload.status === "string" ? payload.status.toLowerCase() : "unknown";
  const youtubeResult = Array.isArray(payload.results)
    ? payload.results.find((item) => item?.platform === "youtube")
    : payload.results?.youtube;
  let status = "processing";
  if (["pending", "queued"].includes(providerStatus)) status = "queued";
  else if (["processing", "in_progress"].includes(providerStatus)) status = "processing";
  else if (providerStatus === "failed") status = "failed";
  else if (providerStatus === "completed" || providerStatus === "success") {
    status = youtubeResult?.success === true && hasValue(youtubeResult.url)
      ? "published"
      : "completed_unverified";
  }

  return {
    status,
    requestId: id,
    providerStatus,
    postUrl: youtubeResult?.success === true && hasValue(youtubeResult.url) ? youtubeResult.url : null,
    message: status === "published"
      ? "The provider status confirms a successful YouTube result with a post URL."
      : status === "completed_unverified"
        ? "The provider reports completion but did not return a verifiable YouTube post URL."
        : status === "failed"
          ? (youtubeResult?.error || payload.message || "Upload-Post reports that the request failed.")
          : "The upload has not reached a verified final state yet.",
  };
}
