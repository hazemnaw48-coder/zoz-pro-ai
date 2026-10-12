export function getControlToken() {
  return process.env.ZOZ_CONTROL_TOKEN ?? "";
}

export function isAuthorized(req) {
  const expected = getControlToken();
  if (!expected) return false;
  const value = req.headers.authorization ?? "";
  return value === `Bearer ${expected}`;
}

export function sendUnauthorized(res) {
  res.writeHead(401, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "www-authenticate": "Bearer",
  });
  res.end(JSON.stringify({
    error: "unauthorized",
    message: "Owner control token is required.",
  }));
}

/**
 * Dedicated integration token for the private Gemini/Studio file handoff only.
 * It must never authorize task, state, approval, or executor endpoints.
 */
export function isHandoffAuthorized(req) {
  const expected = process.env.ZOZ_STUDIO_HANDOFF_TOKEN ?? "";
  if (!expected) return false;
  return (req.headers.authorization ?? "") === `Bearer ${expected}`;
}
