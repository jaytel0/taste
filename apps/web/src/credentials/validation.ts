import type { WebProviderCredentials } from "./secrets";

export type CredentialValidationMetadata = {
  label?: string | undefined;
};

export async function validateCredentials(
  credentials: WebProviderCredentials,
): Promise<CredentialValidationMetadata> {
  return validateOpenRouterApiKey(credentials.openrouterApiKey);
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
