import { NextRequest } from "next/server";

import { env } from "@/config";
import { hashSecret, safeEqualHash } from "@/crypto/secrets";
import { errorResponse, HttpError } from "@/http/errors";
import { cleanupExpiredData } from "@/retention/cleanup";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    requireCronSecret(request);
    const result = await cleanupExpiredData();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

function requireCronSecret(request: NextRequest) {
  const expected = env().CRON_SECRET;
  if (!expected) {
    throw new HttpError(404, "not_found", "Not found.");
  }
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || !safeEqualHash(provided, hashSecret(expected))) {
    throw new HttpError(403, "cron_forbidden", "Cron access required.");
  }
}
