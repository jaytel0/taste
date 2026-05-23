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
}): Promise<OpenRouterResult> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000/lab",
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
  const message =
    firstChoice && typeof firstChoice.message === "object" && firstChoice.message
      ? (firstChoice.message as Record<string, unknown>)
      : {};
  const content = message.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("OpenRouter returned an empty response.");
  }

  return {
    text: content.trim(),
    model: typeof record.model === "string" ? record.model : input.model,
    usage: readUsage(record.usage),
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
  return JSON.parse(stripped.slice(start, end + 1)) as T;
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
