import type { AiProviderCredentials } from "@taste/ai";
import { z } from "zod";

import { env } from "@/config";
import { decryptSecret, encryptSecret, type EncryptedSecret } from "@/crypto/secrets";

export type WebProviderCredentials = Extract<
  AiProviderCredentials,
  { mode: "openrouter" }
>;

export const credentialSchema = z.object({
  mode: z.literal("openrouter"),
  openrouterApiKey: z.string().trim().min(1),
}) satisfies z.ZodType<WebProviderCredentials>;

export const credentialBundleSchema = z.object({
  credentials: credentialSchema,
  source: z.literal("openrouter_oauth"),
  connectedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  label: z.string().optional(),
});

export type CredentialBundle = z.infer<typeof credentialBundleSchema>;

export type CredentialStatus = {
  connected: boolean;
  mode: WebProviderCredentials["mode"] | null;
  source: CredentialBundle["source"] | null;
  label: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
  providers: string[];
};

export function encryptCredentialBundle(bundle: CredentialBundle): EncryptedSecret {
  return encryptSecret(JSON.stringify(credentialBundleSchema.parse(bundle)), env().APP_ENCRYPTION_KEY);
}

export function decryptCredentialBundle(encrypted: EncryptedSecret): CredentialBundle {
  return credentialBundleSchema.parse(
    JSON.parse(decryptSecret(encrypted, env().APP_ENCRYPTION_KEY)),
  );
}

export function encodeEncryptedSecret(encrypted: EncryptedSecret): string {
  return Buffer.from(JSON.stringify(encrypted), "utf8").toString("base64url");
}

export function decodeEncryptedSecret(value: string): EncryptedSecret {
  return z
    .object({
      ciphertext: z.string(),
      iv: z.string(),
      tag: z.string(),
    })
    .parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
}

export function credentialStatus(bundle: CredentialBundle | null): CredentialStatus {
  if (!bundle) {
    return {
      connected: false,
      mode: null,
      source: null,
      label: null,
      connectedAt: null,
      expiresAt: null,
      providers: [],
    };
  }

  return {
    connected: true,
    mode: bundle.credentials.mode,
    source: bundle.source,
    label: bundle.label ?? null,
    connectedAt: bundle.connectedAt,
    expiresAt: bundle.expiresAt ?? null,
    providers: providersForCredentials(bundle.credentials),
  };
}

function providersForCredentials(credentials: AiProviderCredentials): string[] {
  if (credentials.mode === "openrouter") return ["openrouter"];
  return [];
}
