import { handleRequest } from "./server.js";

/**
 * Shared handler used by explicit Vercel route files.
 * Non-Next.js Vercel Functions do not implement Next.js catch-all routing,
 * so deeper API paths need concrete filesystem entrypoints.
 */
export default async function handler(req, res) {
  await handleRequest(req, res);
}
