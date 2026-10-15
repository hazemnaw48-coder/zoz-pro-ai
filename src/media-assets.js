import { randomUUID } from "node:crypto";

export const MEDIA_MANIFEST_PREFIX = "zoz-pro-media/manifests/";
export const MEDIA_OBJECT_PREFIX = "zoz-pro-media/assets/";
export const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
export const MAX_OTHER_BYTES = 25 * 1024 * 1024;
export const SIGNED_URL_TTL_MS = 5 * 60 * 1000;
export const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;

const MIME_BY_EXTENSION = Object.freeze({
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".srt": "text/plain",
  ".vtt": "text/vtt",
  ".json": "application/json",
  ".txt": "text/plain",
});

const SOURCE_SYSTEMS = new Set([
  "floot-production-center",
  "qwen",
  "taaft",
  "digen-ai",
  "zoz-ai-export",
  "openart",
  "runway",
  "other",
]);

const MEDIA_ROLES = new Set([
  "final-video",
  "scene-video",
  "image",
  "thumbnail",
  "audio",
  "captions",
  "manifest",
]);

export class MediaAssetError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.name = "MediaAssetError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function stringField(value, field, maxLength, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new MediaAssetError("invalid_input", field + " is required.");
    return "";
  }
  if (typeof value !== "string") throw new MediaAssetError("invalid_input", field + " must be a string.");
  const normalized = value.trim();
  if (required && !normalized) throw new MediaAssetError("invalid_input", field + " is required.");
  if (normalized.length > maxLength) throw new MediaAssetError("invalid_input", field + " is too long.");
  if (/[\u0000-\u001f\u007f]/.test(normalized)) throw new MediaAssetError("invalid_input", field + " contains control characters.");
  return normalized;
}

function normalizeAssetId(value, generate = false) {
  if ((value === undefined || value === null || value === "") && generate) return randomUUID();
  const id = stringField(value, "assetId", 36, { required: true }).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new MediaAssetError("invalid_asset_id", "assetId must be a UUID.");
  }
  return id;
}

export function sanitizeMediaFilename(value) {
  const leaf = String(value ?? "").replaceAll("\\", "/").split("/").at(-1) ?? "";
  const safe = leaf.trim().replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 160);
  if (!safe || safe === "." || safe === "..") throw new MediaAssetError("invalid_filename", "A valid filename is required.");
  return safe;
}

function extensionOf(filename) {
  const base = sanitizeMediaFilename(filename);
  const index = base.lastIndexOf(".");
  return index < 0 ? "" : base.slice(index).toLowerCase();
}

function roleMatchesMime(role, mime) {
  if (["final-video", "scene-video"].includes(role)) return mime.startsWith("video/");
  if (role === "image" || role === "thumbnail") return mime.startsWith("image/");
  if (role === "audio") return mime.startsWith("audio/");
  if (role === "captions") return [".srt", ".vtt", ".txt"].some((ext) => MIME_BY_EXTENSION[ext] === mime);
  if (role === "manifest") return mime === "application/json";
  return false;
}

export function normalizeMediaMetadata(input = {}, { generateAssetId = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new MediaAssetError("invalid_input", "Media metadata must be an object.");
  }

  const assetId = normalizeAssetId(input.assetId, generateAssetId);
  const originalFilename = stringField(input.originalFilename ?? input.filename, "originalFilename", 240, { required: true });
  const extension = extensionOf(originalFilename);
  const contentType = MIME_BY_EXTENSION[extension];
  if (!contentType) {
    throw new MediaAssetError(
      "unsupported_media_type",
      "Supported outputs: MP4/MOV/WebM video, MP3/M4A/WAV audio, PNG/JPG/WEBP images, SRT/VTT captions, and JSON/TXT manifests.",
      415,
    );
  }

  const sourceSystem = input.sourceSystem === undefined ? "other" : stringField(input.sourceSystem, "sourceSystem", 50, { required: true });
  if (!SOURCE_SYSTEMS.has(sourceSystem)) throw new MediaAssetError("unsupported_source_system", "sourceSystem is not in the allowed source list.");

  const guessedRole = contentType.startsWith("video/") ? "final-video" :
    contentType.startsWith("audio/") ? "audio" :
      contentType.startsWith("image/") ? "image" :
        [".srt", ".vtt", ".txt"].includes(extension) ? "captions" : "manifest";
  const mediaRole = input.mediaRole === undefined ? guessedRole : stringField(input.mediaRole, "mediaRole", 40, { required: true });
  if (!MEDIA_ROLES.has(mediaRole)) throw new MediaAssetError("unsupported_media_role", "mediaRole is not supported.");
  if (!roleMatchesMime(mediaRole, contentType)) {
    throw new MediaAssetError("media_role_type_mismatch", "The selected mediaRole does not match the filename/media type.");
  }

  const title = stringField(input.title ?? input.contentTitle, "title", 200) || originalFilename;
  const jobId = stringField(input.jobId, "jobId", 120);
  if (jobId && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(jobId)) {
    throw new MediaAssetError("invalid_job_id", "jobId may contain only letters, numbers, underscores and hyphens.");
  }

  return {
    schemaVersion: 1,
    assetId,
    sourceSystem,
    jobId: jobId || null,
    title,
    mediaRole,
    originalFilename,
    safeFilename: sanitizeMediaFilename(originalFilename),
    contentType,
  };
}

export function mediaObjectPath(metadata) {
  const normalized = normalizeMediaMetadata(metadata);
  return MEDIA_OBJECT_PREFIX + normalized.assetId + "/" + normalized.safeFilename;
}

export function mediaManifestPath(assetId) {
  return MEDIA_MANIFEST_PREFIX + normalizeAssetId(assetId) + ".json";
}

function manifestFromBlob(blob, metadata, now = new Date()) {
  const normalized = normalizeMediaMetadata(metadata);
  const expectedPath = mediaObjectPath(normalized);
  if (!blob || blob.pathname !== expectedPath) {
    throw new MediaAssetError("uploaded_path_mismatch", "The completed upload path does not match its server-issued asset ID.", 409);
  }
  if (blob.contentType !== normalized.contentType) {
    throw new MediaAssetError("uploaded_type_mismatch", "The uploaded Content-Type does not match the approved file extension.", 415);
  }
  if (Number.isFinite(blob.size) && blob.size > (normalized.contentType.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_OTHER_BYTES)) {
    throw new MediaAssetError("uploaded_file_too_large", "The uploaded file exceeds this workflow's size limit.", 413);
  }

  return {
    schemaVersion: 1,
    assetId: normalized.assetId,
    sourceSystem: normalized.sourceSystem,
    jobId: normalized.jobId,
    title: normalized.title,
    mediaRole: normalized.mediaRole,
    originalFilename: normalized.originalFilename,
    status: "ready_for_import",
    storage: {
      provider: "vercel-blob",
      access: "private",
      pathname: expectedPath,
      contentType: blob.contentType,
      etag: typeof blob.etag === "string" ? blob.etag : null,
      sizeBytes: Number.isSafeInteger(blob.size) ? blob.size : null,
    },
    uploadedAt: blob.uploadedAt instanceof Date ? blob.uploadedAt.toISOString() :
      typeof blob.uploadedAt === "string" && !Number.isNaN(Date.parse(blob.uploadedAt))
        ? new Date(blob.uploadedAt).toISOString()
        : now.toISOString(),
  };
}

async function resolveBlobApi(provided) {
  if (provided) return provided;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new MediaAssetError("media_storage_not_configured", "BLOB_READ_WRITE_TOKEN is required for ZOZ Pro media storage.", 503);
  }
  return import("@vercel/blob");
}

function isNotFound(error) {
  return Number(error?.status ?? error?.statusCode ?? error?.response?.status) === 404 ||
    String(error?.code ?? "").toLowerCase().includes("not_found");
}

async function readBlobJson(api, pathname) {
  let result;
  try {
    result = await api.get(pathname, { access: "private", useCache: false });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  if (!result) return null;
  if (result.statusCode !== 200 || !result.stream) {
    throw new MediaAssetError("media_manifest_unreadable", "Private media manifest could not be read.", 502);
  }
  let value;
  try {
    value = JSON.parse(await new Response(result.stream).text());
  } catch {
    throw new MediaAssetError("media_manifest_invalid", "Stored media manifest is not valid JSON.", 502);
  }
  return { value, etag: result.blob?.etag ?? result.etag ?? null };
}

async function writeNewManifest(manifest, api) {
  const pathname = mediaManifestPath(manifest.assetId);
  const existing = await readBlobJson(api, pathname);
  if (existing) {
    if (existing.value.assetId === manifest.assetId &&
        existing.value.storage?.pathname === manifest.storage?.pathname &&
        existing.value.storage?.etag === manifest.storage?.etag &&
        existing.value.status === manifest.status) {
      return existing.value; // Idempotent completion callback retry.
    }
    throw new MediaAssetError("media_manifest_conflict", "A different manifest already exists for this asset ID.", 409);
  }

  try {
    await api.put(pathname, JSON.stringify(manifest) + "\n", {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
    });
    return manifest;
  } catch (error) {
    const raced = await readBlobJson(api, pathname);
    if (raced && raced.value.assetId === manifest.assetId &&
        raced.value.storage?.pathname === manifest.storage?.pathname &&
        raced.value.storage?.etag === manifest.storage?.etag) return raced.value;
    throw error;
  }
}

async function overwriteManifest(current, updated, api) {
  if (!current.etag) {
    throw new MediaAssetError("media_manifest_conflict", "The manifest lacks an ETag; refusing an unsafe overwrite.", 409);
  }
  const pathname = mediaManifestPath(updated.assetId);
  try {
    await api.put(pathname, JSON.stringify(updated) + "\n", {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      ifMatch: current.etag,
      contentType: "application/json",
    });
    return updated;
  } catch (error) {
    if (Number(error?.status ?? error?.statusCode ?? error?.response?.status) === 412) {
      throw new MediaAssetError("media_manifest_conflict", "The asset manifest changed during this request. Reload it before retrying.", 409);
    }
    throw error;
  }
}

export async function saveCompletedClientUpload(blob, tokenPayload, { blobApi = null, now = () => new Date() } = {}) {
  const api = await resolveBlobApi(blobApi);
  let metadata;
  try {
    metadata = typeof tokenPayload === "string" ? JSON.parse(tokenPayload) : tokenPayload;
  } catch {
    throw new MediaAssetError("invalid_upload_token_payload", "The upload callback contained invalid metadata.", 400);
  }
  const manifest = manifestFromBlob(blob, metadata, now());
  return writeNewManifest(manifest, api);
}

export async function createMediaUploadTicket(input, { blobApi = null, now = () => Date.now() } = {}) {
  const api = await resolveBlobApi(blobApi);
  const metadata = normalizeMediaMetadata(input, { generateAssetId: true });
  const pathname = mediaObjectPath(metadata);
  const validUntil = now() + UPLOAD_URL_TTL_MS;
  const token = await api.issueSignedToken({
    pathname,
    operations: ["put"],
    validUntil,
  });
  const { presignedUrl } = await api.presignUrl(token, {
    pathname,
    operation: "put",
    validUntil,
  });

  const manifest = {
    schemaVersion: 1,
    assetId: metadata.assetId,
    sourceSystem: metadata.sourceSystem,
    jobId: metadata.jobId,
    title: metadata.title,
    mediaRole: metadata.mediaRole,
    originalFilename: metadata.originalFilename,
    status: "awaiting_upload",
    storage: {
      provider: "vercel-blob",
      access: "private",
      pathname,
      contentType: metadata.contentType,
      etag: null,
      sizeBytes: null,
    },
    createdAt: new Date(now()).toISOString(),
    uploadedAt: null,
  };
  await writeNewManifest(manifest, api);

  return {
    assetId: metadata.assetId,
    pathname,
    uploadUrl: presignedUrl,
    method: "PUT",
    contentType: metadata.contentType,
    maximumSizeBytes: metadata.contentType.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_OTHER_BYTES,
    expiresAt: new Date(validUntil).toISOString(),
    completeEndpoint: "/api/content-factory/media/assets/" + metadata.assetId + "/complete",
  };
}

export async function readMediaManifest(assetId, { blobApi = null } = {}) {
  const api = await resolveBlobApi(blobApi);
  const record = await readBlobJson(api, mediaManifestPath(assetId));
  return record?.value ?? null;
}

export async function completeMediaUpload(assetId, { blobApi = null, now = () => new Date() } = {}) {
  const api = await resolveBlobApi(blobApi);
  const pathname = mediaManifestPath(assetId);
  const current = await readBlobJson(api, pathname);
  if (!current) throw new MediaAssetError("media_asset_not_found", "Media asset was not found.", 404);
  if (current.value.status === "ready_for_import" || current.value.status === "imported_to_studio") {
    return current.value; // Idempotent completion request after a lost response.
  }
  if (current.value.status !== "awaiting_upload") {
    throw new MediaAssetError("media_asset_not_uploadable", "The media asset is not waiting for an upload.", 409);
  }

  const blob = await api.head(current.value.storage.pathname, { access: "private" });
  if (!blob || blob.pathname !== current.value.storage.pathname) {
    throw new MediaAssetError("uploaded_blob_not_found", "The file has not reached private media storage yet.", 409);
  }
  if (blob.contentType !== current.value.storage.contentType) {
    throw new MediaAssetError("uploaded_type_mismatch", "The stored file Content-Type does not match the upload ticket.", 415);
  }
  const sizeLimit = blob.contentType?.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_OTHER_BYTES;
  if (!Number.isSafeInteger(blob.size) || blob.size <= 0 || blob.size > sizeLimit) {
    throw new MediaAssetError("uploaded_file_size_invalid", "The uploaded file size is missing, zero, or above the allowed limit.", 413);
  }

  const updated = {
    ...current.value,
    status: "ready_for_import",
    storage: {
      ...current.value.storage,
      etag: typeof blob.etag === "string" ? blob.etag : null,
      sizeBytes: blob.size,
    },
    uploadedAt: blob.uploadedAt instanceof Date ? blob.uploadedAt.toISOString() :
      typeof blob.uploadedAt === "string" && !Number.isNaN(Date.parse(blob.uploadedAt))
        ? new Date(blob.uploadedAt).toISOString()
        : now().toISOString(),
  };
  return overwriteManifest(current, updated, api);
}

export async function listMediaAssets({ limit = 50, cursor = undefined, blobApi = null } = {}) {
  const api = await resolveBlobApi(blobApi);
  const parsedLimit = Number(limit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw new MediaAssetError("invalid_limit", "limit must be an integer from 1 to 100.");
  }
  const options = { prefix: MEDIA_MANIFEST_PREFIX, limit: parsedLimit, access: "private" };
  if (cursor) options.cursor = stringField(cursor, "cursor", 2048, { required: true });
  const result = await api.list(options);
  const blobs = Array.isArray(result.blobs) ? result.blobs : [];
  const manifests = await Promise.all(blobs.map(async (blob) => {
    const record = await readBlobJson(api, blob.pathname);
    return record?.value ?? null;
  }));
  return {
    assets: manifests.filter(Boolean).map((asset) => ({
      assetId: asset.assetId,
      sourceSystem: asset.sourceSystem,
      jobId: asset.jobId,
      title: asset.title,
      mediaRole: asset.mediaRole,
      originalFilename: asset.originalFilename,
      status: asset.status,
      contentType: asset.storage?.contentType ?? null,
      sizeBytes: asset.storage?.sizeBytes ?? null,
      uploadedAt: asset.uploadedAt ?? null,
      createdAt: asset.createdAt ?? null,
    })),
    cursor: result.cursor ?? null,
    hasMore: result.hasMore === true,
  };
}

export async function createMediaDownloadUrl(assetId, { blobApi = null, now = () => Date.now() } = {}) {
  const api = await resolveBlobApi(blobApi);
  const manifest = await readMediaManifest(assetId, { blobApi: api });
  if (!manifest) throw new MediaAssetError("media_asset_not_found", "Media asset was not found.", 404);
  if (!["ready_for_import", "imported_to_studio"].includes(manifest.status)) {
    throw new MediaAssetError("media_asset_not_ready", "The file has not been fully uploaded and verified.", 409);
  }

  const pathname = manifest.storage?.pathname;
  if (typeof pathname !== "string" || !pathname.startsWith(MEDIA_OBJECT_PREFIX)) {
    throw new MediaAssetError("invalid_stored_path", "The manifest contains an invalid media path.", 500);
  }
  const validUntil = now() + SIGNED_URL_TTL_MS;
  const token = await api.issueSignedToken({ pathname, operations: ["get"], validUntil });
  const { presignedUrl } = await api.presignUrl(token, {
    pathname,
    operation: "get",
    validUntil,
  });
  return {
    assetId: manifest.assetId,
    title: manifest.title,
    filename: manifest.originalFilename,
    contentType: manifest.storage.contentType,
    url: presignedUrl,
    expiresAt: new Date(validUntil).toISOString(),
  };
}

export function mediaAssetSummary(manifest) {
  return {
    assetId: manifest.assetId,
    sourceSystem: manifest.sourceSystem,
    jobId: manifest.jobId,
    title: manifest.title,
    mediaRole: manifest.mediaRole,
    originalFilename: manifest.originalFilename,
    status: manifest.status,
    contentType: manifest.storage?.contentType ?? null,
    sizeBytes: manifest.storage?.sizeBytes ?? null,
    uploadedAt: manifest.uploadedAt ?? null,
    createdAt: manifest.createdAt ?? null,
  };
}
