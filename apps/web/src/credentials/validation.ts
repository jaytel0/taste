import type { AiProviderCredentials } from "@taste/ai";

export type CredentialValidationMetadata = {
  label?: string | undefined;
};

export async function validateCredentials(
  credentials: AiProviderCredentials,
): Promise<CredentialValidationMetadata> {
  if (credentials.mode === "openrouter") {
    return validateOpenRouterApiKey(credentials.openrouterApiKey);
  }
  if (credentials.mode === "direct") {
    await Promise.all([
      validateOpenAIKey(credentials.openaiApiKey),
      validateAnthropicKey(credentials.anthropicApiKey),
    ]);
    return { label: "OpenAI + Anthropic" };
  }
  return {};
}

export async function validateOpenRouterApiKey(
  apiKey: string,
): Promise<CredentialValidationMetadata> {
  const response = await fetch("https://openrouter.ai/api/v1/key", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error("OpenRouter key could not be validated.");
  }

  const data = (await response.json()) as {
    data?: {
      label?: string;
      limit_remaining?: number;
    };
  };
  return { label: data.data?.label ?? "OpenRouter" };
}

async function validateOpenAIKey(apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error("OpenAI key could not be validated.");
  }
}

async function validateAnthropicKey(apiKey: string) {
  const response = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error("Anthropic key could not be validated.");
  }
}
