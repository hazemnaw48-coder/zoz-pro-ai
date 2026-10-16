export function getControlToken() {
  return process.env.ZOZ_PRO_CONTROL_TOKEN || process.env.ZOZ_CONTROL_TOKEN || "";
}

export function isAuthorized(req) {
  const value = req.headers.authorization ?? "";
  if (!value.startsWith("Bearer ")) return false;
  const presented = value.slice("Bearer ".length);
  if (!presented) return false;
  const accepted = [process.env.ZOZ_PRO_CONTROL_TOKEN, process.env.ZOZ_CONTROL_TOKEN]
    .filter((token) => typeof token === "string" && token.length > 0);
  return accepted.some((token) => value === `Bearer ${token}`);
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
