/**
 * Normalizes HTTP header and Vercel Blob metadata ETags for equality checks.
 * Keep the original metadata ETag for ifMatch writes; normalization is only
 * for comparing the version returned by GET with the one returned by HEAD.
 */
export function normalizeBlobEtag(value) {
  if (typeof value !== "string") return null;
  let etag = value.trim();
  if (etag.startsWith("W/")) etag = etag.slice(2).trim();
  if (etag.length >= 2 && etag.startsWith('"') && etag.endsWith('"')) {
    etag = etag.slice(1, -1);
  }
  return etag || null;
}
