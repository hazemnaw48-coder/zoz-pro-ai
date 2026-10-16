import { handleRequest } from "../../../src/server.js";

// Forward three-segment API paths such as /api/tasks/:id/transition and
// /api/content-factory/publications/:id to the shared application router.
export default async function handler(req, res) {
  await handleRequest(req, res);
}
