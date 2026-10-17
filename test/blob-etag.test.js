import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBlobEtag } from "../src/blob-etag.js";

test("normalizes GET header and Blob metadata ETag representations for comparison", () => {
  assert.equal(normalizeBlobEtag('"state-v1"'), "state-v1");
  assert.equal(normalizeBlobEtag("state-v1"), "state-v1");
  assert.equal(normalizeBlobEtag('W/"state-v1"'), "state-v1");
  assert.equal(normalizeBlobEtag('"state-v1"'), normalizeBlobEtag("state-v1"));
});

test("rejects missing ETags and keeps different versions distinct", () => {
  assert.equal(normalizeBlobEtag(undefined), null);
  assert.equal(normalizeBlobEtag("   "), null);
  assert.notEqual(normalizeBlobEtag('"state-v1"'), normalizeBlobEtag('"state-v2"'));
});
