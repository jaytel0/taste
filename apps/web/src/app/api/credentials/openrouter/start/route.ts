import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createOpenRouterAuthUrl, createPkcePair } from "@/credentials/openrouter";
import { setOpenRouterOauthStateCookie } from "@/credentials/session";
import { errorResponse } from "@/http/errors";
import { enforceRateLimit } from "@/http/security";

export async function GET(request: NextRequest) {
  try {
    await enforceRateLimit(request, { bucket: "credentials:openrouter_start", limit: 30, windowSeconds: 60 * 60 });
    const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
    const format = request.nextUrl.searchParams.get("format");
    const state = randomBytes(24).toString("base64url");
    const { codeVerifier, codeChallenge } = createPkcePair();
    const callbackUrl = new URL("/api/credentials/openrouter/callback", request.nextUrl.origin);
    callbackUrl.searchParams.set("state", state);
    const authUrl = createOpenRouterAuthUrl({
      callbackUrl: callbackUrl.toString(),
      codeChallenge,
    });

    const response =
      format === "json"
        ? NextResponse.json({ url: authUrl })
        : NextResponse.redirect(authUrl);

    setOpenRouterOauthStateCookie(response, {
      state,
      codeVerifier,
      returnTo,
      createdAt: new Date().toISOString(),
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

function sanitizeReturnTo(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
