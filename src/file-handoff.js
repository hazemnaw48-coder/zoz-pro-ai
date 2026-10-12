import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream, createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { get, list, put } from "@vercel/blob";

export const MAX_INLINE_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_STUDIO_FILE_BYTES = 100 * 1024 * 1024;

const DIRECTIONS = new Set(["from-gemini", "to-gemini"]);
const ALLOWED_EXTENSIONS = new Set([
  ".zip", ".mp4", ".mov", ".webm", ".mkv", ".mp3", ".wav", ".m4a",
  ".srt", ".vtt", ".json", ".txt", ".pdf", ".png", ".jpg", ".jpeg",
  ".webp", ".gif", ".md", ".ts", ".tsx", ".js", ".jsx", ".py", ".html",
  ".css", ".xml", ".csv"
]);
const TYPE_BY_EXTENSION = {
  ".zip": "application/zip", ".mp4": "video/mp4", ".mov": "video/quicktime",
  ".webm": "video/webm", ".mkv": "video/x-matroska", ".mp3": "audio/mpeg",
  ".wav": "audio/wav", ".m4a": "audio/mp4", ".srt": "application/x-subrip",
  ".vtt": "text/vtt", ".json": "application/json", ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".md": "text/markdown; charset=utf-8", ".ts": "text/plain; charset=utf-8",
  ".tsx": "text/plain; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".jsx": "text/plain; charset=utf-8", ".py": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".xml": "application/xml", ".csv": "text/csv; charset=utf-8"
};

function usesBlob() {
  return Boolean(process.env.VERCEL || process.env.ZOZ_CLOUD_STATE === "true");
}

function dataRoot() {
  return path.resolve(process.env.ZOZ_DATA_DIR ?? path.join(process.cwd(), "data"), "handoff");
}

export function normalizeHandoffDirection(value) {
  if (!DIRECTIONS.has(value)) throw new Error("direction must be from-gemini or to-gemini");
  return value;
}

export function sanitizeHandoffFilename(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("filename is required");
  const basename = path.posix.basename(value.replaceAll("\\", "/")).normalize("NFC");
  const cleaned = basename
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}._() -]/gu, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 120);
  if (!cleaned || cleaned === "." || cleaned === "..") throw new Error("filename is invalid");
  const extension = path.extname(cleaned).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error("file type is not allowed");
  return cleaned;
}

function newPathname(direction, filename) {
  return `handoff/${direction}/${Date.now()}-${randomUUID().slice(0, 8)}/${filename}`;
}

function contentTypeFor(filename, requested) {
  const ext = path.extname(filename).toLowerCase();
  const expected = TYPE_BY_EXTENSION[ext] ?? "application/octet-stream";
  if (typeof requested === "string" && requested.trim() && !requested.includes("\r") && !requested.includes("\n")) {
    // Do not trust browser-provided active types; file extensions determine the response type.
    if (["text/html", "image/svg+xml", "application/javascript", "text/javascript"].includes(requested.toLowerCase()) && ![".html", ".js", ".jsx"].includes(ext)) {
      return "application/octet-stream";
    }
  }
  return expected;
}

function createByteLimiter(maxBytes, hash = null) {
  let size = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) {
        callback(new Error("file_too_large"));
        return;
      }
      if (hash) hash.update(chunk);
      callback(null, chunk);
    }
  });
  return { limiter, getSize: () => size };
}

function parseStoredPathname(pathname) {
  if (typeof pathname !== "string" || !/^handoff\/(?:from-gemini|to-gemini)\/[0-9]+-[a-f0-9]{8}\/[\p{L}\p{N}._() -]+$/u.test(pathname)) {
    throw new Error("invalid handoff pathname");
  }
  const parts = pathname.split("/");
  const direction = normalizeHandoffDirection(parts[1]);
  const filename = sanitizeHandoffFilename(parts[3]);
  return { direction, filename, id: parts[2], pathname };
}

async function persistStream({ direction, filename, contentType, stream, maxBytes }) {
  direction = normalizeHandoffDirection(direction);
  filename = sanitizeHandoffFilename(filename);
  contentType = contentTypeFor(filename, contentType);
  const pathname = newPathname(direction, filename);
  const hash = createHash("sha256");
  const { limiter, getSize } = createByteLimiter(maxBytes, hash);
  const input = stream instanceof Readable ? stream : Readable.fromWeb(stream);
  const bounded = input.pipe(limiter);

  if (usesBlob()) {
    await put(pathname, bounded, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType,
      multipart: true
    });
  } else {
    const destination = path.join(dataRoot(), direction, path.basename(path.dirname(pathname)), filename);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    try {
      await pipeline(bounded, createWriteStream(destination, { flags: "wx" }));
    } catch (error) {
      await fs.rm(destination, { force: true }).catch(() => {});
      throw error;
    }
  }

  return {
    id: path.basename(path.dirname(pathname)),
    pathname,
    direction,
    filename,
    size: getSize(),
    contentType,
    sha256: hash.digest("hex"),
    source: direction === "from-gemini" ? "Google AI Studio / Gemini" : "ZOZ Pro",
    uploadedAt: new Date().toISOString()
  };
}

export async function saveInlineHandoff({ direction, filename, contentBase64, contentType }) {
  if (typeof contentBase64 !== "string" || !contentBase64 || contentBase64.length > Math.ceil(MAX_INLINE_FILE_BYTES * 4 / 3) + 16) {
    throw new Error("inline_file_limit_exceeded");
  }
  const content = Buffer.from(contentBase64, "base64");
  if (!content.length || content.length > MAX_INLINE_FILE_BYTES) throw new Error("inline_file_limit_exceeded");
  const hash = createHash("sha256").update(content);
  const result = await persistStream({
    direction,
    filename,
    contentType,
    stream: Readable.from(content),
    maxBytes: MAX_INLINE_FILE_BYTES
  });
  result.sha256 = hash.digest("hex");
  return result;
}

export function validateStudioOutputUrl(value, env = process.env) {
  if (!env.ZOZ_CONTENT_STUDIO_URL) throw new Error("studio_url_not_configured");
  let source;
  let base;
  try {
    source = new URL(value);
    base = new URL(env.ZOZ_CONTENT_STUDIO_URL);
  } catch {
    throw new Error("invalid_source_url");
  }
  if (source.protocol !== "https:" || source.origin !== base.origin || source.username || source.password) {
    throw new Error("source_url_must_match_configured_https_studio");
  }
  if (!source.pathname.startsWith("/api/zoz-pro/outputs/") || source.pathname.includes("/../") || source.pathname.toLowerCase().includes("%2e%2e")) {
    throw new Error("source_url_must_be_a_studio_output");
  }
  return source;
}

export async function importStudioOutput({ sourceUrl, filename, direction = "from-gemini" }) {
  direction = normalizeHandoffDirection(direction);
  const source = validateStudioOutputUrl(sourceUrl);
  const token = process.env.ZOZ_CONTENT_STUDIO_TOKEN;
  if (!token) throw new Error("studio_handoff_token_not_configured");
  const response = await fetch(source, {
    headers: { authorization: `Bearer ${token}` },
    redirect: "manual",
    signal: AbortSignal.timeout(60_000)
  });
  if (response.status !== 200 || !response.body) throw new Error("studio_output_fetch_failed");
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_STUDIO_FILE_BYTES) {
    await response.body.cancel().catch(() => {});
    throw new Error("studio_file_limit_exceeded");
  }
  const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type.startsWith("text/html")) {
    await response.body.cancel().catch(() => {});
    throw new Error("studio_output_returned_html_not_a_file");
  }
  return persistStream({
    direction,
    filename,
    contentType: type,
    stream: response.body,
    maxBytes: MAX_STUDIO_FILE_BYTES
  });
}

export async function listHandoffFiles(direction = null) {
  if (direction !== null) normalizeHandoffDirection(direction);
  if (usesBlob()) {
    const result = await list({ prefix: direction ? `handoff/${direction}/` : "handoff/", limit: 1000 });
    return result.blobs
      .map((blob) => {
        try {
          const parsed = parseStoredPathname(blob.pathname);
          return {
            id: parsed.id,
            pathname: blob.pathname,
            direction: parsed.direction,
            filename: parsed.filename,
            size: blob.size,
            contentType: blob.contentType ?? contentTypeFor(parsed.filename),
            uploadedAt: blob.uploadedAt
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  }

  const root = dataRoot();
  const results = [];
  for (const dir of (direction ? [direction] : [...DIRECTIONS])) {
    const dirRoot = path.join(root, dir);
    let groups = [];
    try { groups = await fs.readdir(dirRoot, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const group of groups) {
      if (!group.isDirectory() || !/^\d+-[a-f0-9]{8}$/.test(group.name)) continue;
      const groupPath = path.join(dirRoot, group.name);
      for (const file of await fs.readdir(groupPath, { withFileTypes: true })) {
        if (!file.isFile()) continue;
        const filename = sanitizeHandoffFilename(file.name);
        const stats = await fs.stat(path.join(groupPath, filename));
        results.push({
          id: group.name,
          pathname: `handoff/${dir}/${group.name}/${filename}`,
          direction: dir,
          filename,
          size: stats.size,
          contentType: contentTypeFor(filename),
          uploadedAt: stats.mtime.toISOString()
        });
      }
    }
  }
  return results.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

export async function openHandoffFile(pathname) {
  const parsed = parseStoredPathname(pathname);
  if (usesBlob()) {
    const result = await get(parsed.pathname, { access: "private" });
    if (!result) throw new Error("handoff_file_not_found");
    return {
      ...parsed,
      contentType: contentTypeFor(parsed.filename),
      stream: result.stream
    };
  }
  const fullPath = path.resolve(dataRoot(), parsed.direction, parsed.id, parsed.filename);
  const root = path.resolve(dataRoot());
  if (!fullPath.startsWith(root + path.sep)) throw new Error("invalid_handoff_path");
  try {
    await fs.access(fullPath);
  } catch {
    throw new Error("handoff_file_not_found");
  }
  return {
    ...parsed,
    contentType: contentTypeFor(parsed.filename),
    stream: createReadStream(fullPath)
  };
}
