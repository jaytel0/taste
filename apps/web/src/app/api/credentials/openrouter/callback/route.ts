import { NextRequest, NextResponse } from "next/server";

import { exchangeOpenRouterCode } from "@/credentials/openrouter";
import {
  clearOpenRouterOauthStateCookie,
  readOpenRouterOauthState,
  setCredentialBundleCookie,
} from "@/credentials/session";
import { validateOpenRouterApiKey } from "@/credentials/validation";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthState = readOpenRouterOauthState(request);
  const failureRedirect = new URL("/", request.nextUrl.origin);
  failureRedirect.searchParams.set("credentials", "openrouter_failed");

  if (!code || !state || !oauthState || state !== oauthState.state) {
    const response = NextResponse.redirect(failureRedirect);
    clearOpenRouterOauthStateCookie(response);
    return response;
  }

  try {
    const openrouterApiKey = await exchangeOpenRouterCode({
      code,
      codeVerifier: oauthState.codeVerifier,
    });
    const metadata = await validateOpenRouterApiKey(openrouterApiKey);
    const bundle = {
      credentials: {
        mode: "openrouter",
        openrouterApiKey,
      },
      source: "openrouter_oauth",
      connectedAt: new Date().toISOString(),
      ...(metadata.label ? { label: metadata.label } : {}),
    } as const;

    const redirectTo = new URL(oauthState.returnTo, request.nextUrl.origin);
    redirectTo.searchParams.set("credentials", "openrouter_connected");
    const response = NextResponse.redirect(redirectTo);
    await setCredentialBundleCookie(response, bundle);
    clearOpenRouterOauthStateCookie(response);
    return response;
  } catch {
    const response = NextResponse.redirect(failureRedirect);
    clearOpenRouterOauthStateCookie(response);
    return response;
  }
}
