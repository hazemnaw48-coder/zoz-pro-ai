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
