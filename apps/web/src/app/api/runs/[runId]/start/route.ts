import { NextRequest } from "next/server";
import { after } from "next/server";

import { analysisModels } from "@/config";
import {
  appendRunEvent,
  claimStatus,
  listImages,
} from "@/db/repository";
import { errorResponse } from "@/http/errors";
import { requireRunAccess, routeParams } from "@/http/auth";
import { assertSameOrigin, enforceRateLimit } from "@/http/security";
import { enqueueRunWorkflow, kickWorkflowDrain } from "@/workflow/runner";

export const maxDuration = 800;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await routeParams(context);
  try {
    await assertSameOrigin(request);
    await enforceRateLimit(request, { bucket: "runs:start", limit: 60, windowSeconds: 60 * 60 });
    const access = await requireRunAccess(request, runId);
    if (!access.ok) return access.response;
    if (access.run.status !== "uploading") {
      return Response.json({ error: `Run cannot be started from ${access.run.status}` }, { status: 409 });
    }
    const images = await listImages(runId);
    if (images.length === 0) {
      return Response.json({ error: "Upload at least one image before starting" }, { status: 400 });
    }
    if (images.length > access.run.maxImages) {
      return Response.json({ error: `Run cannot exceed ${access.run.maxImages} images` }, { status: 400 });
    }
    if (access.run.expectedImageCount !== null && images.length !== access.run.expectedImageCount) {
      return Response.json(
        { error: `Run expects ${access.run.expectedImageCount} images, but ${images.length} uploaded` },
        { status: 400 },
      );
    }
    const claimed = await claimStatus(runId, "uploading", "queued", "Queued", {
      progressPercent: 1,
    });
    if (!claimed) {
      return Response.json({ error: "Run was already started" }, { status: 409 });
    }
    await appendRunEvent(runId, "run.queued", `Queued run with ${images.length} images`, {
      images: images.length,
      analysisModels: analysisModels(),
    });
    await enqueueRunWorkflow(runId);
    after(async () => kickWorkflowDrain(request.nextUrl.origin));
    return Response.json({ ok: true, runId, status: "queued" });
  } catch (error) {
    return errorResponse(error);
  }
}
