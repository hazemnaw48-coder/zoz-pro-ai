const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30_000;

function resolveTimeoutMs(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_HEARTBEAT_TIMEOUT_MS;
}

export function getExecutorStatus(executor, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const configuredTimeout =
    options.timeoutMs ?? process.env.ZOZ_EXECUTOR_HEARTBEAT_TIMEOUT_MS;
  const heartbeatTimeoutMs = resolveTimeoutMs(configuredTimeout);
  const record = {
    agent: "Codex",
    status: "offline",
    lastSeen: null,
    hostname: null,
    currentCommandId: null,
    lastError: null,
    ...(executor && typeof executor === "object" ? executor : {}),
  };

  const lastSeenAt =
    typeof record.lastSeen === "string" ? Date.parse(record.lastSeen) : Number.NaN;
  const heartbeatAgeMs = now - lastSeenAt;
  const heartbeatFresh =
    Number.isFinite(lastSeenAt) &&
    heartbeatAgeMs >= 0 &&
    heartbeatAgeMs <= heartbeatTimeoutMs;

  return {
    ...record,
    status: heartbeatFresh ? "online" : "offline",
    heartbeatFresh,
    heartbeatAgeMs:
      Number.isFinite(lastSeenAt) && heartbeatAgeMs >= 0
        ? heartbeatAgeMs
        : null,
    heartbeatTimeoutMs,
  };
}
