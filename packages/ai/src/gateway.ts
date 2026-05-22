import { createGateway } from "@ai-sdk/gateway";
import { generateText } from "ai";

import type { ImageInput, TextGenerationResult } from "./types";

export async function generateGatewayText(input: {
  aiGatewayToken?: string | undefined;
  model: string;
  prompt: string;
  maxOutputTokens: number;
}): Promise<TextGenerationResult> {
  const gateway = createGateway(input.aiGatewayToken ? { apiKey: input.aiGatewayToken } : undefined);
  const result = await withGatewayRetries(() =>
    generateText({
      model: gateway(input.model),
      prompt: input.prompt,
      maxOutputTokens: input.maxOutputTokens,
      maxRetries: 2,
      timeout: { totalMs: 180_000 },
    }),
  );
  return toTextGenerationResult(input.model, result);
}

export async function generateGatewayVisionText(input: {
  aiGatewayToken?: string | undefined;
  model: string;
  prompt: string;
  image: ImageInput;
  maxOutputTokens: number;
}): Promise<TextGenerationResult> {
  const gateway = createGateway(input.aiGatewayToken ? { apiKey: input.aiGatewayToken } : undefined);
  const result = await withGatewayRetries(() =>
    generateText({
      model: gateway(input.model),
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
    }),
  );
  return toTextGenerationResult(input.model, result);
}

async function withGatewayRetries<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === 5 || !isRetryableGatewayError(error)) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(error, attempt)));
    }
  }
  throw lastError;
}

function isRetryableGatewayError(error: unknown): boolean {
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
