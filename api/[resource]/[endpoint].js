import { handleRequest } from "../../src/server.js";

// Vercel's non-Next.js Functions router matches one explicit path segment per
// bracketed filename. This handler forwards two-segment API paths to the
// shared application router (for example, /api/content-factory/status).
export default async function handler(req, res) {
  await handleRequest(req, res);
}
