import { NextRequest } from "next/server";

import { cancelRun } from "@/db/repository";
import { requireRunAccess, routeParams } from "@/http/auth";
import { errorResponse } from "@/http/errors";
import { assertSameOrigin, enforceRateLimit } from "@/http/security";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await routeParams(context);
  try {
    await assertSameOrigin(request);
    await enforceRateLimit(request, { bucket: "runs:cancel", limit: 60, windowSeconds: 60 * 60 });
    const access = await requireRunAccess(request, runId);
    if (!access.ok) return access.response;
    const run = await cancelRun(runId);
    return Response.json({ ok: true, runId: run.id, status: run.status });
  } catch (error) {
    return errorResponse(error);
  }
}
