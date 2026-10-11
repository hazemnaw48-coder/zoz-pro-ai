const hasValue = (value) => typeof value === "string" && value.trim().length > 0;

/**
 * Read-only readiness snapshot for the Content Factory integration.
 * This deliberately does not make outbound requests or expose configured secret values.
 */
export function getContentFactoryStatus({ state = null, env = process.env } = {}) {
  const studioConfigured = hasValue(env.ZOZ_CONTENT_STUDIO_URL);
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
      id: "zoz-content-studio",
      name: "ZOZ Content Production Studio",
      status: studioConfigured ? "configured_unverified" : "not_connected",
      verified: false,
      configurationKey: "ZOZ_CONTENT_STUDIO_URL",
      detail: studioConfigured
        ? "A server-side base URL is configured, but the adapter and live health check are not verified."
        : "No server-side studio URL is configured. No request has been sent to the studio.",
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
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    phase: "connection_preparation",
    overallStatus: connectors.some((item) => item.status === "not_connected" || item.status === "not_configured" || item.status === "offline")
      ? "incomplete"
      : "ready_for_review",
    projectBoundary: {
      controllerRepository: "hazemnaw48-coder/zoz-pro-ai",
      legacyZoZAi: "standby_and_out_of_scope",
      legacyZoZAiMayBeModified: false,
      deploymentStatus: state?.project?.deploymentStatus ?? "unknown",
      automaticPublishing: false,
    },
    safety: {
      secretsReturned: false,
      outboundConnectionChecksPerformed: false,
      publishingEnabled: false,
      ownerApprovalRequiredForExternalSendOrProductionChanges: true,
    },
    connectors,
    nextSteps: [
      "Keep ZOZ Pro as the task, approval and audit control plane.",
      "Confirm the actual Content Studio API contract before setting ZOZ_CONTENT_STUDIO_URL.",
      "Implement and test an authenticated adapter before sending commands to the Content Studio.",
      "Keep ZOZ AI separate and in standby until its repository access is restored and independently verified.",
      "Do not enable publishing or production deployment until explicit owner approval.",
    ],
  };
}
