import { after, NextRequest } from "next/server";

import { errorResponse } from "@/http/errors";
import { requireAutomationAccess } from "@/http/security";
import { drainWorkflow, kickWorkflowDrain } from "@/workflow/runner";

export const maxDuration = 800;

export async function GET(request: NextRequest) {
  return drain(request);
}

export async function POST(request: NextRequest) {
  return drain(request);
}

async function drain(request: NextRequest) {
  try {
    requireAutomationAccess(request);
    const result = await drainWorkflow();
    if (result.hasMore) {
      after(async () => kickWorkflowDrain(request.nextUrl.origin));
    }
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
