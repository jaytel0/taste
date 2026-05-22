import { NextRequest } from "next/server";

import { listActiveImages } from "@/db/repository";
import { routeParams, requireRunAccess } from "@/http/auth";
import { errorResponse } from "@/http/errors";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await routeParams(context);
  const access = await requireRunAccess(request, runId);
  if (!access.ok) return access.response;
  try {
    const images = await listActiveImages(runId);
    return Response.json({
      images: images
        .filter((img) => img.imageId !== null && img.imageId !== "")
        .map((img) => ({
          imageId: img.imageId,
          blobUrl: img.blobUrl,
          basename: img.basename,
        })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
