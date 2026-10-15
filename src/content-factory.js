const hasValue = (value) => typeof value === "string" && value.trim().length > 0;

/** Read-only status. External generators are launch links/manual file imports, not API integrations. */
export function getContentFactoryStatus({ state = null, env = process.env } = {}) {
  const storageConfigured = hasValue(env.BLOB_READ_WRITE_TOKEN);
  const claudeConfigured = hasValue(env.ANTHROPIC_API_KEY);
  const rendererConfigured = hasValue(env.FFMPEG_PATH) || hasValue(env.FFMPEG_BINARY);
  const codexOnline = state?.executor?.status === "online";
  const connectors = [
    {
      id: "zoz-pro-control", name: "ZOZ Pro control plane", status: "ready", verified: true,
      detail: "Authenticated tasks, owner approvals, state and audit trail remain inside ZOZ Pro.",
      secretValuesExposed: false,
    },
    {
      id: "codex-executor", name: "Codex local executor", status: codexOnline ? "online" : "offline",
      verified: codexOnline,
      detail: codexOnline ? "The local executor has recently reported online." : "The local Windows executor is not currently reporting online.",
      secretValuesExposed: false,
    },
    {
      id: "external-generator-tools", name: "TAAFT / Qwen / Digen AI", status: "manual_export_import", verified: false,
      detail: "Tools open independently in their own websites. Generate and download the actual artifact, then import it here. No generator API or Google AI Studio connection is active.",
      secretValuesExposed: false,
    },
    {
      id: "private-media-storage", name: "ZOZ Pro private media storage",
      status: storageConfigured ? "configured_unverified" : "not_configured", verified: false,
      configurationKey: "BLOB_READ_WRITE_TOKEN",
      detail: storageConfigured
        ? "A server-side setting is present; an actual upload/download and phone playback have not been verified by this status check."
        : "Private media storage is not configured in this runtime. Upload tickets fail closed until storage is available.",
      secretValuesExposed: false,
    },
    {
      id: "claude-api", name: "Claude API reviewer",
      status: claudeConfigured ? "configured_unverified" : "not_configured", verified: false,
      configurationKey: "ANTHROPIC_API_KEY",
      detail: claudeConfigured ? "A key is present, but this check makes no request and triggers no billing usage." : "Claude API is not configured on the ZOZ Pro server.",
      secretValuesExposed: false,
    },
    {
      id: "media-renderer", name: "FFmpeg / media renderer",
      status: rendererConfigured ? "configured_unverified" : "not_verified", verified: false,
      configurationKey: "FFMPEG_PATH",
      detail: rendererConfigured ? "A renderer path is set, but executable availability and a real render have not been tested." : "Renderer availability has not been checked from this runtime.",
      secretValuesExposed: false,
    },
    {
      id: "publishing", name: "External publishing", status: "disabled_pending_approval", verified: false,
      detail: "Publishing stays locked until a separate media center and verified file-delivery path are selected and tested, then approved by the owner.",
      secretValuesExposed: false,
    },
  ];
  return {
    schemaVersion: 2,
    checkedAt: new Date().toISOString(),
    phase: "independent_media_intake",
    overallStatus: connectors.some((item) => ["not_configured", "offline", "not_verified"].includes(item.status)) ? "incomplete" : "ready_for_review",
    projectBoundary: {
      controllerRepository: "hazemnaw48-coder/zoz-pro-ai",
      mediaCenter: "zoz-pro-independent-manual-import",
      googleAIStudioConnection: "disabled",
      legacyZoZAi: "standby_and_out_of_scope",
      legacyZoZAiMayBeModified: false,
      deploymentStatus: state?.project?.deploymentStatus ?? "unknown",
      automaticPublishing: false,
    },
    safety: {
      secretsReturned: false,
      externalGenerationApiCallsPerformed: false,
      googleAIStudioConnected: false,
      outboundConnectionChecksPerformed: false,
      publishingEnabled: false,
      ownerApprovalRequiredForExternalSendOrProductionChanges: true,
    },
    connectors,
    nextSteps: [
      "Open TAAFT, Qwen or Digen AI independently, generate content and download the actual file.",
      "Import the file through ZOZ Pro private-media intake, then verify the manifest, download and phone playback.",
      "Do not configure, call or transfer credentials to Google AI Studio.",
      "Keep export and publishing locked until a separate media center and verified file-delivery path are selected and tested.",
      "Keep the legacy ZOZ AI system and credentials completely separate.",
    ],
  };
}
