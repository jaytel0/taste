import type { TokenUsage } from "./types";

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterResult = {
  text: string;
  model: string;
  usage: TokenUsage | null;
};

export async function callOpenRouter(input: {
  apiKey: string;
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  json?: boolean | undefined;
  label?: string | undefined;
  retries?: number | undefined;
}): Promise<OpenRouterResult> {
  const maxAttempts = (input.retries ?? 1) + 1;
  let lastEmptyResponse: EmptyResponseDetails | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await callOpenRouterOnce(input);
    if (result.text.trim().length > 0) return result;

    lastEmptyResponse = result.emptyResponse;
    if (attempt < maxAttempts) {
      await delay(750 * attempt);
    }
  }

  throw new Error(describeEmptyResponse(input, lastEmptyResponse));
}

type EmptyResponseDetails = {
  contentType: string;
  finishReason: string | null;
  nativeFinishReason: string | null;
  hasReasoning: boolean;
  refusal: string | null;
};

async function callOpenRouterOnce(input: {
  apiKey: string;
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  json?: boolean | undefined;
}): Promise<OpenRouterResult & { emptyResponse: EmptyResponseDetails | null }> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3010/lab",
      "X-Title": "Taste Skill Lab",
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 6000,
      ...(input.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(describeOpenRouterError(response.status, data));
  }

  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const finishReason = stringOrNull(firstChoice?.finish_reason);
  const nativeFinishReason = stringOrNull(firstChoice?.native_finish_reason);
  const message =
    firstChoice && typeof firstChoice.message === "object" && firstChoice.message
      ? (firstChoice.message as Record<string, unknown>)
      : {};
  const content = readMessageContent(message.content);

  return {
    text: content.trim(),
    model: typeof record.model === "string" ? record.model : input.model,
    usage: readUsage(record.usage),
    emptyResponse:
      content.trim().length === 0
        ? {
            contentType: typeof message.content,
            finishReason,
            nativeFinishReason,
            hasReasoning:
              typeof message.reasoning === "string" && message.reasoning.trim().length > 0,
            refusal: stringOrNull(message.refusal),
          }
        : null,
  };
}

export function parseJsonObject<T>(text: string): T {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response did not contain a JSON object.");
  }
  try {
    return JSON.parse(stripped.slice(start, end + 1)) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Model response contained malformed JSON: ${message}`);
  }
}

function readMessageContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";

  return value
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const record = part as Record<string, unknown>;
      if (typeof record.text === "string") return record.text;
      if (typeof record.content === "string") return record.content;
      return "";
    })
    .join("");
}

function readUsage(value: unknown): TokenUsage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    inputTokens: numberOrNull(record.prompt_tokens ?? record.input_tokens),
    outputTokens: numberOrNull(record.completion_tokens ?? record.output_tokens),
    totalTokens: numberOrNull(record.total_tokens ?? record.totalTokens),
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function describeEmptyResponse(
  input: { model: string; label?: string | undefined },
  details: EmptyResponseDetails | null,
): string {
  const scope = input.label ? ` for ${input.label}` : "";
  const detailParts = [
    `model=${input.model}`,
    details?.finishReason ? `finish_reason=${details.finishReason}` : null,
    details?.nativeFinishReason ? `native_finish_reason=${details.nativeFinishReason}` : null,
    details?.contentType ? `content_type=${details.contentType}` : null,
    details?.hasReasoning ? "reasoning_without_content=true" : null,
    details?.refusal ? `refusal=${details.refusal}` : null,
  ].filter(Boolean);

  return `OpenRouter returned an empty response${scope}. ${detailParts.join("; ")}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeOpenRouterError(status: number, data: unknown): string {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const error = record.error;
    if (error && typeof error === "object") {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string") return `OpenRouter error ${status}: ${message}`;
    }
    const message = record.message;
    if (typeof message === "string") return `OpenRouter error ${status}: ${message}`;
  }
  return `OpenRouter request failed with status ${status}.`;
}
