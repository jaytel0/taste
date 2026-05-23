import { NextRequest } from "next/server";

import { verifyRunSecret } from "@/db/repository";

export function readRunSecret(request: NextRequest): string | null {
  return request.headers.get("x-run-secret");
}

export async function requireRunAccess(request: NextRequest, runId: string) {
  const runSecret = readRunSecret(request);
  if (!runSecret) {
    return {
      ok: false as const,
      response: Response.json({ error: "Missing run secret" }, { status: 401 }),
    };
  }
  try {
    const run = await verifyRunSecret(runId, runSecret);
    return { ok: true as const, run };
  } catch {
    return {
      ok: false as const,
      response: Response.json({ error: "Invalid run secret" }, { status: 403 }),
    };
  }
}

export async function routeParams<T extends Record<string, string>>(
  context: { params: T | Promise<T> },
): Promise<T> {
  return context.params instanceof Promise ? context.params : context.params;
}
