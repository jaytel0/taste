import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGateway, generateText, type LanguageModel } from "ai";

import type { AiProviderCredentials, ImageInput, TextGenerationResult } from "./types";

export async function generateProviderText(input: {
  credentials?: AiProviderCredentials | undefined;
  model: string;
  prompt: string;
  maxOutputTokens: number;
  abortSignal?: AbortSignal | undefined;
}): Promise<TextGenerationResult> {
  const result = await withProviderRetries(() =>
    generateText({
      model: createLanguageModel(input.credentials, input.model),
      prompt: input.prompt,
      maxOutputTokens: input.maxOutputTokens,
      maxRetries: 2,
      timeout: { totalMs: 180_000 },
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    }),
  );
  return toTextGenerationResult(input.model, result);
}

export async function generateProviderVisionText(input: {
  credentials?: AiProviderCredentials | undefined;
  model: string;
  prompt: string;
  image: ImageInput;
  maxOutputTokens: number;
  abortSignal?: AbortSignal | undefined;
}): Promise<TextGenerationResult> {
  const result = await withProviderRetries(() =>
    generateText({
      model: createLanguageModel(input.credentials, input.model),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: input.prompt },
            {
              type: "image",
              image: input.image.bytes,
              mediaType: input.image.mediaType,
            },
          ],
        },
      ],
      maxOutputTokens: input.maxOutputTokens,
      maxRetries: 2,
      timeout: { totalMs: 180_000 },
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    }),
  );
  return toTextGenerationResult(input.model, result);
}

function createLanguageModel(
  credentials: AiProviderCredentials | undefined,
  model: string,
): LanguageModel {
  if (!credentials) {
    throw new Error("AI provider credentials are required.");
  }

  if (credentials.mode === "openrouter") {
    return createOpenRouter({ apiKey: credentials.openrouterApiKey })(model);
  }

  if (credentials.mode === "vercel_gateway") {
    return createGateway({ apiKey: credentials.aiGatewayApiKey })(model);
  }

  if (credentials.mode === "openai") {
    assertProviderModel(model, "openai", "OpenAI credential mode");
    return createOpenAI({ apiKey: credentials.openaiApiKey })(
      stripProviderPrefix(model, "openai"),
    );
  }

  if (credentials.mode === "anthropic") {
    assertProviderModel(model, "anthropic", "Anthropic credential mode");
    return createAnthropic({ apiKey: credentials.anthropicApiKey })(
      stripProviderPrefix(model, "anthropic"),
    );
  }

  if (model.startsWith("openai/")) {
    return createOpenAI({ apiKey: credentials.openaiApiKey })(
      stripProviderPrefix(model, "openai"),
    );
  }

  if (model.startsWith("anthropic/")) {
    return createAnthropic({ apiKey: credentials.anthropicApiKey })(
      stripProviderPrefix(model, "anthropic"),
    );
  }

  throw new Error(`Direct credential mode does not support model: ${model}`);
}

function assertProviderModel(
  model: string,
  provider: "openai" | "anthropic",
  mode: string,
) {
  if (!model.startsWith(`${provider}/`)) {
    throw new Error(`${mode} does not support model: ${model}`);
  }
}

function stripProviderPrefix(model: string, provider: "openai" | "anthropic"): string {
  const prefix = `${provider}/`;
  return model.startsWith(prefix) ? model.slice(prefix.length) : model;
}

async function withProviderRetries<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === 5 || !isRetryableProviderError(error)) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(error, attempt)));
    }
  }
  throw lastError;
}

function isRetryableProviderError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return false;
  const status = errorStatus(error);
  if (status === undefined) return true;
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function retryDelayMs(error: unknown, attempt: number): number {
  const retryAfter = retryAfterMs(error);
  if (retryAfter !== null) return retryAfter;
  const base = Math.min(30_000, 1000 * 2 ** attempt);
  return base + Math.floor(Math.random() * 500);
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  const status =
    record.statusCode ??
    record.status ??
    record.responseStatus ??
    (typeof record.response === "object" && record.response
      ? (record.response as Record<string, unknown>).status
      : undefined);
  return typeof status === "number" ? status : undefined;
}

function retryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const headers = record.responseHeaders ?? record.headers;
  if (!headers || typeof headers !== "object") return null;
  const retryAfter =
    headers instanceof Headers
      ? headers.get("retry-after")
      : ((headers as Record<string, unknown>)["retry-after"] ??
        (headers as Record<string, unknown>)["Retry-After"]);
  if (typeof retryAfter !== "string") return null;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(retryAfter);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

function toTextGenerationResult(
  fallbackModel: string,
  result: Awaited<ReturnType<typeof generateText>>,
): TextGenerationResult {
  const usage = result.totalUsage ?? result.usage;
  return {
    text: result.text.trim(),
    model: result.response?.modelId ?? fallbackModel,
    usage: {
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
    },
  };
}
