import { handleRequest } from "../../../../src/server.js";

// Forward four-segment API paths such as publication submission and queued
// command lifecycle actions to the shared application router.
export default async function handler(req, res) {
  await handleRequest(req, res);
}
