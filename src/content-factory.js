import { getContentStudioClientStatus } from "./content-studio-client.js";
import { getGpuWorkerStatus } from "./gpu-worker-client.js";

const hasValue = (value) => typeof value === "string" && value.trim().length > 0;

/**
 * Read-only readiness snapshot for the Content Factory integration.
 * This deliberately does not make outbound requests or expose configured secret values.
 */
export function getContentFactoryStatus({ state = null, env = process.env } = {}) {
  const studioStatus = getContentStudioClientStatus({ env });
  const gpuWorkerStatus = getGpuWorkerStatus({ env });
  const claudeConfigured = hasValue(env.ANTHROPIC_API_KEY);
  const ffmpegConfigured = hasValue(env.FFMPEG_PATH) || hasValue(env.FFMPEG_BINARY);
  const codexOnline = state?.executor?.status === "online";

  const connectors = [
    {
      id: "zoz-pro-control",
      name: "ZOZ Pro control plane",
      status: "ready",
      verified: true,
      detail: "Authenticated task, status and approval control are provided by this ZOZ Pro server.",
      secretValuesExposed: false,
    },
    {
      id: "codex-executor",
      name: "Codex local executor",
      status: codexOnline ? "online" : "offline",
      verified: codexOnline,
      detail: codexOnline
        ? "The local executor has recently reported online."
        : "The local Windows runtime/executor is not currently reporting online.",
      secretValuesExposed: false,
    },
    {
      ...studioStatus,
      name: "ZOZ Content Production Studio",
      configurationKey: "ZOZ_CONTENT_STUDIO_URL",
      detail: studioStatus.detail,
      secretValuesExposed: false,
    },
    {
      ...gpuWorkerStatus,
      name: "Hourly rented GPU video-generation worker",
      configurationKey: "ZOZ_GPU_WORKER_URL",
      detail: gpuWorkerStatus.detail,
      secretValuesExposed: false,
    },
    {
      id: "kaggle-free-gpu",
      name: "Kaggle GPU notebook — free renewable quota",
      provider: "Kaggle",
      status: "not_connected",
      configured: false,
      verified: false,
      scope: "zoz_pro_only",
      configurationKeys: ["ZOZ_PRO_KAGGLE_MCP_URL", "ZOZ_PRO_KAGGLE_KERNEL", "ZOZ_PRO_KAGGLE_API_TOKEN"],
      quota: {
        amount: 30,
        unit: "GPU-hours",
        period: "week",
        renewable: true,
        variability: "Kaggle notes the quota can be higher depending on demand and resources.",
        source: "Kaggle official GPU usage documentation",
      },
      legacyEvidence: {
        kaggleEnvironmentVariablesObservedInZoZAiRailway: true,
        kaggleHostResolutionObservedInZoZAiRuntimeLogs: true,
        legacyCredentialsCopied: false,
      },
      detail: "Kaggle is the strongest match for the reported 30 free GPU hours. The legacy ZOZ AI Railway configuration contains Kaggle API/MCP/kernel settings and runtime logs show Kaggle traffic. ZOZ Pro is deliberately not connected yet; use a separately authorized token and confirm the MCP/API contract first.",
      secretValuesExposed: false,
    },
    {
      id: "runpod-legacy-image-endpoint",
      name: "RunPod image endpoint — separate legacy integration",
      provider: "RunPod",
      status: "not_connected",
      verified: false,
      scope: "legacy_zoz_ai",
      legacyEvidence: {
        endpointIdVariableObserved: "RUNPOD_IMAGE_ENDPOINT_ID",
        valuesRead: false,
      },
      capability: "image_generation_unverified_video",
      detail: "ZOZ AI has a separate RunPod image-endpoint setting. This is not the source of Kaggle's renewable 30-hour quota, and the current evidence does not prove that the configured RunPod endpoint supports video generation. Do not copy its credentials or route video jobs to it without capability verification.",
      secretValuesExposed: false,
    },
    {
      id: "gemini",
      name: "Gemini generation services",
      status: "not_integrated",
      verified: false,
      detail: "Gemini is reported as part of the existing content studio; ZOZ Pro has not verified a direct Gemini integration.",
      secretValuesExposed: false,
    },
    {
      id: "claude-api",
      name: "Claude API reviewer",
      status: claudeConfigured ? "configured_unverified" : "not_configured",
      verified: false,
      configurationKey: "ANTHROPIC_API_KEY",
      detail: claudeConfigured
        ? "An API key is present on the server, but no Claude request or billing usage is triggered by this status check."
        : "Claude API is not configured on the ZOZ Pro server. No request or charge is triggered.",
      secretValuesExposed: false,
    },
    {
      id: "media-renderer",
      name: "FFmpeg / media renderer",
      status: ffmpegConfigured ? "configured_unverified" : "not_verified",
      verified: false,
      configurationKey: "FFMPEG_PATH",
      detail: ffmpegConfigured
        ? "A renderer path setting is present, but executable availability and a real render have not been tested."
        : "Renderer availability has not been checked from this runtime.",
      secretValuesExposed: false,
    },
    {
      id: "publishing",
      name: "Channel publishing",
      status: "disabled_pending_approval",
      verified: false,
      detail: "Publishing remains disabled until credentials, platform permissions, private-test behavior and owner approval are verified.",
      secretValuesExposed: false,
    },
  ];

  return {
    schemaVersion: 3,
    checkedAt: new Date().toISOString(),
    phase: "connection_preparation",
    overallStatus: connectors.some((item) => ["not_connected", "not_configured", "offline", "invalid_configuration", "not_verified"].includes(item.status))
      ? "incomplete"
      : "ready_for_review",
    projectBoundary: {
      controllerRepository: "hazemnaw48-coder/zoz-pro-ai",
      newIntegrationsTarget: "ZOZ_PRO_ONLY",
      legacyZoZAi: "preserved_and_usable_separately",
      legacyZoZAiMayBeModified: false,
      legacyCredentialsMayBeReusedInZOZPro: false,
      legacyVideoToolReuseMode: "kaggle_free_gpu_separate_authorization; paid_gpu_provider_remains_separate_or_explicit_asset_handoff",
      observedLegacyProviders: {
        kaggleGpu: "configured variables and runtime Kaggle traffic observed; exact MCP/kernel values withheld",
        runpodImageEndpoint: "endpoint ID variable observed; actual media capability not verified",
      },
      ownerReportedVideoAllowance: {
        amount: 30,
        unit: "GPU-hours",
        renewal: "weekly_quota_per_Kaggle_documentation; account quota can vary",
        provider: "Kaggle",
        providerIdentified: true,
        actual_ZOZ_Pro_connection_verified: false,
      },
      deploymentStatus: state?.project?.deploymentStatus ?? "unknown",
      automaticPublishing: false,
    },
    safety: {
      secretsReturned: false,
      outboundConnectionChecksPerformed: false,
      publishingEnabled: false,
      ownerApprovalRequiredForExternalSendOrProductionChanges: true,
      legacyZoZAiConnectionsModified: false,
    },
    connectors,
    nextSteps: [
      "Keep all new integrations, credentials, databases and workflow modules under ZOZ Pro only.",
      "Do not alter or disconnect any existing ZOZ AI integration; keep it independently usable as before.",
      "Configure ZOZ_CONTENT_STUDIO_URL and a dedicated ZOZ_CONTENT_STUDIO_TOKEN only on the ZOZ Pro server after the Studio exposes the protected /api/zozpro/health endpoint.",
      "Use POST /api/content-factory/studio/verify to run the explicit, read-only authenticated handshake after configuration.",
      "Kaggle is the strongest match for the 30 free GPU-hour clue; establish a separate ZOZ Pro Kaggle authorization and confirm the worker/MCP contract before running jobs.",
      "Keep the legacy RunPod image endpoint separate; it is not proven to be a video-generation endpoint.",
      "Configure ZOZ_GPU_WORKER_URL and a dedicated ZOZ_GPU_WORKER_TOKEN only after a protected worker-side /api/zozpro/health endpoint exists.",
      "Use the owner-authenticated GPU verification endpoint to confirm the rented worker without starting a rental or generation job.",
      "If the legacy provider cannot support a separate authorization, use an explicit exported-asset handoff rather than reusing ZOZ AI secrets or changing its connection.",
      "Do not enable publishing or production deployment until explicit owner approval.",
    ],
  };
}
