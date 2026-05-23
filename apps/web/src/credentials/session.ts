import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config";
import { decryptSecret, encryptSecret } from "@/crypto/secrets";
import {
  createCredentialSession,
  deleteCredentialSession,
  readCredentialSession,
} from "@/db/repository";
import {
  credentialStatus,
  decodeEncryptedSecret,
  encodeEncryptedSecret,
  type CredentialBundle,
} from "./secrets";

const credentialsCookie = "taste_ai_credentials";
const openRouterOauthCookie = "taste_openrouter_oauth";
const oauthMaxAgeSeconds = 60 * 10;

const credentialSessionCookieSchema = z.object({
  sessionId: z.string().uuid(),
  sessionSecret: z.string().min(1),
});

export type OpenRouterOauthState = {
  state: string;
  codeVerifier: string;
  returnTo: string;
  createdAt: string;
};

export async function readCredentialBundle(request: NextRequest): Promise<CredentialBundle | null> {
  const value = request.cookies.get(credentialsCookie)?.value;
  if (!value) return null;
  try {
    const encrypted = decodeEncryptedSecret(value);
    const sessionRef = credentialSessionCookieSchema.parse(
      JSON.parse(decryptSecret(encrypted, env().APP_ENCRYPTION_KEY)),
    );
    return readCredentialSession(sessionRef.sessionId, sessionRef.sessionSecret);
  } catch {
    return null;
  }
}

export async function setCredentialBundleCookie(response: NextResponse, bundle: CredentialBundle) {
  const session = await createCredentialSession(bundle);
  const cookieValue = encodeEncryptedSecret(
    encryptSecret(
      JSON.stringify({
        sessionId: session.session.id,
        sessionSecret: session.sessionSecret,
      }),
      env().APP_ENCRYPTION_KEY,
    ),
  );
  response.cookies.set(credentialsCookie, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: env().CREDENTIAL_SESSION_TTL_HOURS * 60 * 60,
  });
  return session.bundle;
}

export async function clearCredentialBundleCookie(request: NextRequest, response: NextResponse) {
  const value = request.cookies.get(credentialsCookie)?.value;
  if (value) {
    try {
      const encrypted = decodeEncryptedSecret(value);
      const sessionRef = credentialSessionCookieSchema.parse(
        JSON.parse(decryptSecret(encrypted, env().APP_ENCRYPTION_KEY)),
      );
      await deleteCredentialSession(sessionRef.sessionId);
    } catch {
      /* stale or malformed cookies are cleared below */
    }
  }
  response.cookies.delete(credentialsCookie);
}

export function readOpenRouterOauthState(request: NextRequest): OpenRouterOauthState | null {
  const value = request.cookies.get(openRouterOauthCookie)?.value;
  if (!value) return null;
  try {
    const encrypted = decodeEncryptedSecret(value);
    return JSON.parse(decryptSecret(encrypted, env().APP_ENCRYPTION_KEY)) as OpenRouterOauthState;
  } catch {
    return null;
  }
}

export function setOpenRouterOauthStateCookie(
  response: NextResponse,
  state: OpenRouterOauthState,
) {
  response.cookies.set(
    openRouterOauthCookie,
    encodeEncryptedSecret(encryptSecret(JSON.stringify(state), env().APP_ENCRYPTION_KEY)),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: oauthMaxAgeSeconds,
    },
  );
}

export function clearOpenRouterOauthStateCookie(response: NextResponse) {
  response.cookies.delete(openRouterOauthCookie);
}

export async function credentialStatusFromRequest(request: NextRequest) {
  return credentialStatus(await readCredentialBundle(request));
}
