import { NextRequest, NextResponse } from "next/server";

import {
  clearCredentialBundleCookie,
  credentialStatusFromRequest,
} from "@/credentials/session";
import { errorResponse } from "@/http/errors";
import { assertSameOrigin, enforceRateLimit } from "@/http/security";

export async function GET(request: NextRequest) {
  return NextResponse.json(await credentialStatusFromRequest(request));
}

export async function DELETE(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    await enforceRateLimit(request, { bucket: "credentials:clear", limit: 20, windowSeconds: 60 * 60 });
    const response = NextResponse.json({ ok: true });
    await clearCredentialBundleCookie(request, response);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
