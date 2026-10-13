const ENDPOINT = "https://www.kaggle.com/mcp";

export class KaggleMcpError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "KaggleMcpError";
    this.code = code;
    this.status = status;
  }
}

function getToken(env) {
  const token = typeof env.ZOZ_PRO_KAGGLE_MCP_TOKEN === "string"
    ? env.ZOZ_PRO_KAGGLE_MCP_TOKEN.trim()
    : "";
  return token.length >= 20 ? token : null;
}

export function getKaggleStatus({ env = process.env } = {}) {
  const configured = Boolean(getToken(env));
  return {
    id: "kaggle-free-gpu",
    provider: "Kaggle",
    endpoint: ENDPOINT,
    status: configured ? "configured_unverified" : "not_connected",
    configured,
    verified: false,
    quota: {
      amount: 30,
      unit: "GPU-hours",
      period: "week",
      renewable: true,
      source: "https://www.kaggle.com/docs/efficient-gpu-usage",
      note: "Actual quota depends on Kaggle account and current availability.",
    },
    costGuard: {
      statusCheckContactsKaggle: false,
      verifyStartsNotebook: false,
      verifyConsumesGpuQuota: false,
      ownerApprovalRequiredBeforeExecution: true,
    },
    secretValuesExposed: false,
    detail: configured
      ? "A separate ZOZ Pro token is configured; live connection is not yet verified."
      : "Create a separate Kaggle token for ZOZ Pro and store it as a server-side secret. Do not reuse the legacy ZOZ AI token.",
  };
}

/**
 * Read-only MCP discovery only. Never invokes tools/call or starts a notebook.
 */
export async function verifyKaggleMcp({ env = process.env, fetchImpl = fetch } = {}) {
  const token = getToken(env);
  if (!token) {
    throw new KaggleMcpError("kaggle_not_configured", "A separate ZOZ_PRO_KAGGLE_MCP_TOKEN is required.", 409);
  }

  async function rpc(method, id, params, sessionId, version) {
    const headers = {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    if (version) headers["MCP-Protocol-Version"] = version;

    let response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new KaggleMcpError("kaggle_unreachable", "Kaggle MCP could not be reached. No notebook was started.", 502);
    }
    if (response.status === 401 || response.status === 403) {
      throw new KaggleMcpError("kaggle_auth_rejected", "Kaggle rejected the separate ZOZ Pro token.", 403);
    }
    if (!response.ok) {
      throw new KaggleMcpError("kaggle_http_error", "Kaggle MCP returned HTTP " + response.status + ".", response.status === 429 ? 429 : 502);
    }

    const session = response.headers.get("Mcp-Session-Id") || sessionId || null;
    if (id === undefined) return { session };
    const raw = await response.text();
    let message;
    try {
      if (raw.trim().startsWith("{")) message = JSON.parse(raw);
      else {
        const data = raw.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).find(Boolean);
        message = data ? JSON.parse(data) : null;
      }
    } catch {
      throw new KaggleMcpError("kaggle_invalid_response", "Kaggle MCP returned an unreadable response.", 502);
    }
    if (!message || message.id !== id || message.error || !message.result) {
      throw new KaggleMcpError("kaggle_rpc_failed", "Kaggle MCP did not complete the read-only request.", 502);
    }
    return { result: message.result, session };
  }

  const init = await rpc("initialize", 1, {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "zoz-pro-kaggle-bridge", version: "0.1.0" },
  });
  if (typeof init.result.protocolVersion !== "string" || !init.result.serverInfo) {
    throw new KaggleMcpError("kaggle_bad_handshake", "Kaggle MCP handshake was incomplete.", 502);
  }

  await rpc("notifications/initialized", undefined, undefined, init.session, init.result.protocolVersion);
  const listed = await rpc("tools/list", 2, {}, init.session, init.result.protocolVersion);
  const tools = Array.isArray(listed.result.tools)
    ? listed.result.tools.filter((tool) => tool && typeof tool.name === "string").slice(0, 100).map((tool) => ({
      name: tool.name.slice(0, 120),
      description: typeof tool.description === "string" ? tool.description.slice(0, 200) : "",
    }))
    : [];
  if (!tools.length) throw new KaggleMcpError("kaggle_no_tools", "Kaggle MCP connected but returned no available tools.", 502);

  return {
    id: "kaggle-free-gpu",
    provider: "Kaggle",
    endpoint: ENDPOINT,
    status: "connected",
    configured: true,
    verified: true,
    protocolVersion: init.result.protocolVersion,
    serverName: typeof init.result.serverInfo.name === "string" ? init.result.serverInfo.name.slice(0, 120) : "Kaggle MCP",
    toolCount: tools.length,
    tools,
    quota: getKaggleStatus({ env }).quota,
    costGuard: { notebookStarted: false, gpuQuotaConsumed: false, ownerApprovalRequiredBeforeExecution: true },
    checkedAt: new Date().toISOString(),
    secretValuesExposed: false,
  };
}
