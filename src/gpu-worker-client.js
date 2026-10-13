const hasValue = (value) => typeof value === "string" && value.trim().length > 0;

export class GpuWorkerClientError extends Error {
  constructor(code, message, httpStatus = 502) {
    super(message);
    this.name = "GpuWorkerClientError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function readWorkerConfiguration(env = process.env) {
  const missingConfiguration = [];
  if (!hasValue(env.ZOZ_GPU_WORKER_URL)) missingConfiguration.push("ZOZ_GPU_WORKER_URL");
  if (!hasValue(env.ZOZ_GPU_WORKER_TOKEN) || env.ZOZ_GPU_WORKER_TOKEN.trim().length < 32) {
    missingConfiguration.push("ZOZ_GPU_WORKER_TOKEN (minimum 32 characters)");
  }

  if (missingConfiguration.length) {
    return { configured: false, missingConfiguration, origin: null, token: null };
  }

  let origin;
  try {
    origin = new URL(env.ZOZ_GPU_WORKER_URL.trim());
  } catch {
    throw new GpuWorkerClientError("invalid_worker_url", "ZOZ_GPU_WORKER_URL must be an absolute HTTPS origin.", 409);
  }

  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    (origin.pathname !== "/" && origin.pathname !== "")
  ) {
    throw new GpuWorkerClientError(
      "invalid_worker_url",
      "ZOZ_GPU_WORKER_URL must be an HTTPS origin only, without credentials, query, fragment, or path.",
      409,
    );
  }

  return {
    configured: true,
    missingConfiguration: [],
    origin,
    token: env.ZOZ_GPU_WORKER_TOKEN.trim(),
  };
}

/**
 * Read-only status. Does not start/stop rented machines, run workflows, or incur usage.
 * The endpoint represents a worker behind a rented GPU port, not a specific rental vendor.
 */
export function getGpuWorkerStatus({ env = process.env } = {}) {
  try {
    const config = readWorkerConfiguration(env);
    return {
      id: "zoz-gpu-render-worker",
      providerType: "hourly_rented_gpu_worker",
      status: config.configured ? "configured_unverified" : "not_connected",
      configured: config.configured,
      verified: false,
      expectedHandshakePath: "/api/zozpro/health",
      missingConfiguration: config.missingConfiguration,
      secretValuesExposed: false,
      costGuard: {
        startsRentalAutomatically: false,
        stopsRentalAutomatically: false,
        launchesGenerationAutomatically: false,
        ownerApprovalRequiredForPaidUsage: true,
      },
      detail: config.configured
        ? "An HTTPS worker origin and separate ZOZ Pro token are configured. Connection and supported capabilities are not yet verified."
        : "Configure the rented GPU worker's HTTPS origin and a dedicated ZOZ Pro token. This check does not rent a machine or consume GPU time.",
    };
  } catch (error) {
    return {
      id: "zoz-gpu-render-worker",
      providerType: "hourly_rented_gpu_worker",
      status: "invalid_configuration",
      configured: false,
      verified: false,
      expectedHandshakePath: "/api/zozpro/health",
      missingConfiguration: [],
      secretValuesExposed: false,
      costGuard: {
        startsRentalAutomatically: false,
        stopsRentalAutomatically: false,
        launchesGenerationAutomatically: false,
        ownerApprovalRequiredForPaidUsage: true,
      },
      detail: error.message,
    };
  }
}

/**
 * Read-only authenticated handshake to a worker-side adapter. It must never start a GPU rental
 * or launch generation. Do not fall back to unauthenticated ComfyUI or other legacy paths.
 */
export async function verifyGpuWorkerHandshake({ env = process.env, fetchImpl = fetch } = {}) {
  const config = readWorkerConfiguration(env);
  if (!config.configured) {
    throw new GpuWorkerClientError(
      "worker_not_configured",
      "The separate GPU worker HTTPS origin and dedicated ZOZ Pro token are not configured.",
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
    throw new GpuWorkerClientError(
      "worker_unreachable",
      "The authenticated GPU worker handshake could not be reached. No rental or generation request was attempted.",
      502,
    );
  }

  if (response.status === 404 || response.status === 405) {
    throw new GpuWorkerClientError(
      "worker_secure_endpoint_missing",
      "The rented worker does not expose the required protected ZOZ Pro handshake yet. No fallback to an unprotected port was attempted.",
      409,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new GpuWorkerClientError(
      "worker_auth_rejected",
      "The worker rejected the separate ZOZ Pro token. Check worker-side configuration without sharing the token in chat.",
      403,
    );
  }

  if (!response.ok) {
    throw new GpuWorkerClientError(
      "worker_handshake_failed",
      `The GPU worker handshake returned HTTP ${response.status}.`,
      502,
    );
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new GpuWorkerClientError("worker_invalid_response", "The GPU worker handshake did not return valid JSON.", 502);
  }

  const capabilities = Array.isArray(body?.capabilities)
    ? [...new Set(body.capabilities.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean))].slice(0, 30)
    : [];
  const supportedCapabilities = new Set(["video_generation", "image_generation", "video_render", "audio_processing", "asset_transfer"]);
  if (
    body?.success !== true ||
    body?.integration !== "zoz-pro-gpu-worker" ||
    body?.authenticated !== true ||
    capabilities.length === 0 ||
    capabilities.some((capability) => !supportedCapabilities.has(capability))
  ) {
    throw new GpuWorkerClientError(
      "worker_unexpected_response",
      "The response did not satisfy the authenticated ZOZ Pro GPU-worker handshake contract.",
      502,
    );
  }

  return {
    id: "zoz-gpu-render-worker",
    providerType: "hourly_rented_gpu_worker",
    status: "connected",
    configured: true,
    verified: true,
    endpoint: "/api/zozpro/health",
    host: config.origin.host,
    capabilities,
    costGuard: {
      rentalStarted: false,
      generationStarted: false,
      ownerApprovalRequiredForPaidUsage: true,
    },
    checkedAt: new Date().toISOString(),
    secretValuesExposed: false,
  };
}
