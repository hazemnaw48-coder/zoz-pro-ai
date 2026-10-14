const hasValue = (value) => typeof value === "string" && value.trim().length > 0;

export class ContentStudioClientError extends Error {
  constructor(code, message, httpStatus = 502) {
    super(message);
    this.name = "ContentStudioClientError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function readStudioConfiguration(env = process.env) {
  const missingConfiguration = [];
  if (!hasValue(env.ZOZ_CONTENT_STUDIO_URL)) missingConfiguration.push("ZOZ_CONTENT_STUDIO_URL");
  if (!hasValue(env.ZOZ_CONTENT_STUDIO_TOKEN) || env.ZOZ_CONTENT_STUDIO_TOKEN.trim().length < 32) {
    missingConfiguration.push("ZOZ_CONTENT_STUDIO_TOKEN (minimum 32 characters)");
  }

  if (missingConfiguration.length) {
    return { configured: false, missingConfiguration, origin: null, token: null };
  }

  let origin;
  try {
    origin = new URL(env.ZOZ_CONTENT_STUDIO_URL.trim());
  } catch {
    throw new ContentStudioClientError("invalid_studio_url", "ZOZ_CONTENT_STUDIO_URL must be an absolute HTTPS origin.", 409);
  }

  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    (origin.pathname !== "/" && origin.pathname !== "")
  ) {
    throw new ContentStudioClientError(
      "invalid_studio_url",
      "ZOZ_CONTENT_STUDIO_URL must be an HTTPS origin only, without credentials, query, fragment, or path.",
      409,
    );
  }

  return {
    configured: true,
    missingConfiguration: [],
    origin,
    token: env.ZOZ_CONTENT_STUDIO_TOKEN.trim(),
  };
}

/**
 * Configuration-only status. It never makes a network request or returns secret values.
 */
export function getContentStudioClientStatus({ env = process.env } = {}) {
  try {
    const config = readStudioConfiguration(env);
    return {
      id: "zoz-content-studio",
      provider: "ZOZ Content Production Studio",
      status: config.configured ? "configured_unverified" : "not_connected",
      configured: config.configured,
      verified: false,
      missingConfiguration: config.missingConfiguration,
      expectedHandshakePath: "/api/zozpro/health",
      secretValuesExposed: false,
      detail: config.configured
        ? "URL and a dedicated server-side token are configured. The secure ZOZ Pro handshake has not yet been tested."
        : "A separate HTTPS Studio URL and dedicated ZOZ Pro token are required. Existing ZOZ AI credentials must not be copied.",
    };
  } catch (error) {
    return {
      id: "zoz-content-studio",
      provider: "ZOZ Content Production Studio",
      status: "invalid_configuration",
      configured: false,
      verified: false,
      missingConfiguration: [],
      expectedHandshakePath: "/api/zozpro/health",
      secretValuesExposed: false,
      detail: error.message,
    };
  }
}

/**
 * Read-only authenticated handshake. This intentionally targets a new, dedicated endpoint
 * that the legacy studio does not currently expose. It does not call the existing unprotected
 * render, TTS, upload, or project endpoints.
 */
export async function verifyContentStudioHandshake({ env = process.env, fetchImpl = fetch } = {}) {
  const config = readStudioConfiguration(env);
  if (!config.configured) {
    throw new ContentStudioClientError(
      "studio_not_configured",
      "The separate Studio HTTPS origin and dedicated ZOZ Pro token are not configured.",
      409,
    );
  }

  let response;
  try {
    response = await fetchImpl(new URL("/api/zozpro/health", config.origin).toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.token}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new ContentStudioClientError(
      "studio_unreachable",
      "The protected ZOZ Pro Studio handshake could not be reached. No legacy endpoint fallback was attempted.",
      502,
    );
  }

  if (response.status === 404 || response.status === 405) {
    throw new ContentStudioClientError(
      "studio_secure_endpoint_missing",
      "The Studio does not expose the required protected ZOZ Pro handshake endpoint yet. Existing legacy endpoints were not called.",
      409,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new ContentStudioClientError(
      "studio_auth_rejected",
      "The Studio rejected the separate ZOZ Pro token. Check the Studio-side token configuration without sharing the token in chat.",
      403,
    );
  }

  if (!response.ok) {
    throw new ContentStudioClientError(
      "studio_handshake_failed",
      `The protected Studio handshake returned HTTP ${response.status}.`,
      502,
    );
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new ContentStudioClientError("studio_invalid_response", "The Studio handshake did not return valid JSON.", 502);
  }

  const capabilities = Array.isArray(body?.capabilities)
    ? body.capabilities.filter((value) => typeof value === "string").slice(0, 30)
    : [];

  if (
    body?.success !== true ||
    body?.studio !== "ZOZ Content Production Studio" ||
    body?.integration !== "zoz-pro" ||
    body?.authenticated !== true ||
    capabilities.length === 0
  ) {
    throw new ContentStudioClientError(
      "studio_unexpected_response",
      "The response did not satisfy the authenticated ZOZ Pro Studio handshake contract.",
      502,
    );
  }

  return {
    id: "zoz-content-studio",
    provider: "ZOZ Content Production Studio",
    status: "connected",
    configured: true,
    verified: true,
    endpoint: "/api/zozpro/health",
    host: config.origin.host,
    capabilities,
    checkedAt: new Date().toISOString(),
    secretValuesExposed: false,
  };
}
