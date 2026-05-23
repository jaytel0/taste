import { NextRequest, NextResponse } from "next/server";

import { credentialStatus, manualCredentialSchema } from "@/credentials/secrets";
import { setCredentialBundleCookie } from "@/credentials/session";
import { validateCredentials } from "@/credentials/validation";
import { errorResponse } from "@/http/errors";
import { assertSameOrigin, enforceRateLimit } from "@/http/security";

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    await enforceRateLimit(request, { bucket: "credentials:manual", limit: 10, windowSeconds: 60 * 60 });
    const credentials = manualCredentialSchema.parse(await request.json());
    const metadata = await validateCredentials(credentials);
    const now = new Date().toISOString();
    const bundle = {
      credentials,
      source: "manual",
      connectedAt: now,
      ...(metadata.label ? { label: metadata.label } : {}),
    } as const;
    const response = NextResponse.json(credentialStatus(bundle));
    await setCredentialBundleCookie(response, bundle);
    return response;
  } catch (error) {
    return errorResponse(error, 401);
  }
}
