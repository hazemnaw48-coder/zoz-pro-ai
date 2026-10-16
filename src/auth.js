function isDedicatedZp018Preview() {
  return process.env.VERCEL_ENV === "preview"
    && process.env.VERCEL_GIT_COMMIT_REF === "fix/ZP-018-serialized-state-writes";
}

export function getControlToken() {
  if (isDedicatedZp018Preview() && process.env.ZOZ_PRO_PREVIEW_CONTROL_TOKEN) {
    return process.env.ZOZ_PRO_PREVIEW_CONTROL_TOKEN;
  }
  return process.env.ZOZ_PRO_CONTROL_TOKEN || process.env.ZOZ_CONTROL_TOKEN || "";
}

export function isAuthorized(req) {
  const value = req.headers.authorization ?? "";
  if (!value.startsWith("Bearer ")) return false;
  const presented = value.slice("Bearer ".length);
  if (!presented) return false;
  const accepted = [process.env.ZOZ_PRO_CONTROL_TOKEN, process.env.ZOZ_CONTROL_TOKEN];
  if (isDedicatedZp018Preview()) accepted.push(process.env.ZOZ_PRO_PREVIEW_CONTROL_TOKEN);
  return accepted.some((token) => typeof token === "string" && token.length > 0 && value === ("Bearer " + token));
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
