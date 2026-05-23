import { createHash, randomBytes } from "node:crypto";

export function createPkcePair() {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function createOpenRouterAuthUrl(input: {
  callbackUrl: string;
  codeChallenge: string;
}): string {
  const url = new URL("https://openrouter.ai/auth");
  url.searchParams.set("callback_url", input.callbackUrl);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeOpenRouterCode(input: {
  code: string;
  codeVerifier: string;
}): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      code: input.code,
      code_verifier: input.codeVerifier,
      code_challenge_method: "S256",
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error("OpenRouter authorization could not be completed.");
  }

  const payload = (await response.json()) as { key?: string };
  if (!payload.key) {
    throw new Error("OpenRouter did not return an API key.");
  }
  return payload.key;
}
