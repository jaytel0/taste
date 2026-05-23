import { NextRequest } from "next/server";

import { env } from "@/config";
import { incrementRateLimit } from "@/db/repository";
import { hashSecret, safeEqualHash } from "@/crypto/secrets";
import { HttpError } from "./errors";

type RateLimitOptions = {
  bucket: string;
  limit: number;
  windowSeconds: number;
};

export async function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (origin !== request.nextUrl.origin) {
    throw new HttpError(403, "origin_forbidden", "Request origin is not allowed.");
  }
}

export async function enforceRateLimit(request: NextRequest, options: RateLimitOptions) {
  if (!env().RATE_LIMIT_ENABLED) return;
  const windowMs = options.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const count = await incrementRateLimit({
    key: clientIp(request),
    bucket: options.bucket,
    windowStart,
  });
  if (count > options.limit) {
    throw new HttpError(429, "rate_limited", "Too many requests. Try again shortly.");
  }
}

export function requireInternalAccess(request: NextRequest) {
  const expected = env().INTERNAL_API_SECRET;
  if (!expected) {
    throw new HttpError(404, "not_found", "Not found.");
  }
  if (!hasInternalAccess(request)) {
    throw new HttpError(403, "internal_forbidden", "Internal access required.");
  }
}

export function requireAutomationAccess(request: NextRequest) {
  if (hasInternalAccess(request)) return;
  if (hasCronAccess(request)) return;
  throw new HttpError(403, "automation_forbidden", "Automation access required.");
}

function hasInternalAccess(request: NextRequest): boolean {
  const expected = env().INTERNAL_API_SECRET;
  const provided = request.headers.get("x-internal-secret");
  return Boolean(expected && provided && safeEqualHash(provided, hashSecret(expected)));
}

function hasCronAccess(request: NextRequest): boolean {
  const expected = env().CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(expected && provided && safeEqualHash(provided, hashSecret(expected)));
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}
