const INSTRUCTION_PREFIX = "gemini:assist:";
const MAX_PROMPT_CHARS = 3500;
const MAX_OUTPUT_CHARS = 12000;
const DEFAULT_MODEL = "gemini-2.5-flash";

export class GeminiAgentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GeminiAgentError";
    this.code = code;
  }
}

export function extractGeminiPrompt(instruction) {
  if (typeof instruction !== "string") return null;
  const value = instruction.trim();
  if (!value.toLowerCase().startsWith(INSTRUCTION_PREFIX)) return null;
  const prompt = value.slice(INSTRUCTION_PREFIX.length).trim();
  return prompt.length > 0 && prompt.length <= MAX_PROMPT_CHARS ? prompt : null;
}

export function getConfiguredGeminiModel(env = process.env) {
  const model = typeof env.GEMINI_MODEL === "string" && env.GEMINI_MODEL.trim()
    ? env.GEMINI_MODEL.trim()
    : DEFAULT_MODEL;
  if (!/^gemini-[a-z0-9.-]{2,80}$/i.test(model)) {
    throw new GeminiAgentError("gemini_model_invalid", "The configured Gemini model name is invalid.");
  }
  return model;
}

function containsCredentialLikeValue(prompt) {
  return [
    /AIza[0-9A-Za-z_-]{20,}/,
    /\bsk-[A-Za-z0-9_-]{16,}\b/,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ].some((pattern) => pattern.test(prompt));
}

function safeProviderErrorCode(status) {
  if (status === 401 || status === 403) return "gemini_authentication_failed";
  if (status === 429) return "gemini_rate_limited";
  if (status >= 500) return "gemini_provider_unavailable";
  return "gemini_request_rejected";
}

/**
 * Generate text through Google's Gemini API. This module has no tools for
 * sending messages, publishing, spending money, shell access, or modifying
 * external accounts. It only returns text to the caller.
 */
export async function generateGeminiText(prompt, options = {}) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new GeminiAgentError("gemini_prompt_empty", "A non-empty text task is required.");
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new GeminiAgentError("gemini_prompt_too_long", "The text task exceeds the 3500-character limit.");
  }
  if (containsCredentialLikeValue(prompt)) {
    throw new GeminiAgentError("sensitive_input_blocked", "The task appears to contain a credential or secret. Remove it before sending the task to Gemini.");
  }

  const env = options.env ?? process.env;
  const apiKey = typeof env.GEMINI_API_KEY === "string" ? env.GEMINI_API_KEY.trim() : "";
  if (!apiKey) {
    throw new GeminiAgentError("gemini_not_configured", "Gemini is not configured on the cloud worker; GEMINI_API_KEY is missing.");
  }

  const model = getConfiguredGeminiModel(env);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new GeminiAgentError("gemini_fetch_unavailable", "The cloud runtime does not provide an HTTP client.");
  }

  const controller = new AbortController();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1000, options.timeoutMs) : 45000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  let response;
  try {
    response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: [
                "You are the text-only AI worker inside ZOZ Pro, an independent business operating system.",
                "Produce useful, specific work products such as drafts, scripts, analyses, plans, checklists, and reports from the owner's task.",
                "You have no external-action tools. Never claim to have sent a message, published content, spent money, changed an account, modified a repository, run code, or completed an external operation.",
                "If asked for an external, financial, destructive, account, credential, production, or irreversible action, prepare a draft or safe plan only and explicitly state that the action itself requires a dedicated tool and owner approval.",
                "Do not ask for passwords, API keys, access tokens, or private credentials. If the task includes credential-like strings, do not reproduce them.",
                "Return the work product directly, in the language appropriate to the task. Be truthful about uncertainty and do not invent research, tool results, or execution evidence.",
              ].join(" "),
            }],
          },
          contents: [{
            role: "user",
            parts: [{ text: prompt.trim() }],
          }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1800,
          },
        }),
      },
    );
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new GeminiAgentError("gemini_timeout", "Gemini did not respond within the cloud task timeout.");
    }
    throw new GeminiAgentError("gemini_network_error", "The cloud worker could not reach the Gemini API.");
  } finally {
    clearTimeout(timer);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new GeminiAgentError(
      safeProviderErrorCode(response.status),
      `Gemini request failed with HTTP ${response.status}; no external action was performed.`,
    );
  }

  const generatedText = Array.isArray(payload?.candidates)
    ? payload.candidates
      .flatMap((candidate) => candidate?.content?.parts ?? [])
      .map((part) => typeof part?.text === "string" ? part.text : "")
      .filter(Boolean)
      .join("\n")
      .trim()
    : "";

  if (!generatedText) {
    const blocked = payload?.promptFeedback?.blockReason;
    throw new GeminiAgentError(
      blocked ? "gemini_prompt_blocked" : "gemini_empty_response",
      blocked
        ? "Gemini declined the task under its safety rules."
        : "Gemini returned no text result.",
    );
  }

  if (generatedText.length > MAX_OUTPUT_CHARS) {
    return `${generatedText.slice(0, MAX_OUTPUT_CHARS)}\n\n[Output truncated by the ZOZ Pro result-size limit.]`;
  }
  return generatedText;
}

export const GEMINI_AGENT_LIMITS = Object.freeze({
  maxPromptChars: MAX_PROMPT_CHARS,
  maxOutputChars: MAX_OUTPUT_CHARS,
  timeoutMs: 45000,
  defaultModel: DEFAULT_MODEL,
});
