import { describe, expect, it } from "vitest";

import {
  decryptSecret,
  encryptSecret,
  hashSecret,
  safeEqualHash,
} from "../src/crypto/secrets";
import {
  decryptCredentialBundle,
  encryptCredentialBundle,
} from "../src/credentials/secrets";

describe("run secret crypto", () => {
  it("encrypts and decrypts a run-scoped secret", () => {
    const encrypted = encryptSecret("vck_test_token", "test-key-material");

    expect(encrypted.ciphertext).not.toContain("vck_test_token");
    expect(decryptSecret(encrypted, "test-key-material")).toBe("vck_test_token");
  });

  it("compares secret hashes without exposing the secret", () => {
    const hash = hashSecret("run-secret");

    expect(safeEqualHash("run-secret", hash)).toBe(true);
    expect(safeEqualHash("wrong-secret", hash)).toBe(false);
  });

  it("encrypts and decrypts run credential bundles", () => {
    process.env.DATABASE_URL = "postgres://example";
    process.env.APP_ENCRYPTION_KEY = "test-key-material-with-at-least-32-bytes";
    const encrypted = encryptCredentialBundle({
      credentials: {
        mode: "openrouter",
        openrouterApiKey: "sk-or-v1-secret",
      },
      source: "manual",
      connectedAt: "2026-05-23T00:00:00.000Z",
    });

    expect(encrypted.ciphertext).not.toContain("sk-or-v1-secret");
    expect(decryptCredentialBundle(encrypted).credentials).toEqual({
      mode: "openrouter",
      openrouterApiKey: "sk-or-v1-secret",
    });
  });
});
