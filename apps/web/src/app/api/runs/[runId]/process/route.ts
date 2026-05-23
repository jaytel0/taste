import { NextRequest } from "next/server";

import { routeParams, requireRunAccess } from "@/http/auth";
import { errorResponse } from "@/http/errors";
import { assertSameOrigin, requireInternalAccess } from "@/http/security";
import { drainWorkflow, enqueueRunWorkflow } from "@/workflow/runner";

export const maxDuration = 800;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await routeParams(context);
  try {
    await assertSameOrigin(request);
    requireInternalAccess(request);
    const access = await requireRunAccess(request, runId);
    if (!access.ok) return access.response;
    await enqueueRunWorkflow(runId);
    await drainWorkflow();
    return Response.json({ ok: true, runId });
  } catch (error) {
    return errorResponse(error);
  }
}
