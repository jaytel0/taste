import { issueSignedToken, presignUrl } from "@vercel/blob";
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
    const validUntil = Date.now() + 5 * 60 * 1000;
    return Response.json({
      images: await Promise.all(
        images
          .filter((img) => img.imageId !== null && img.imageId !== "")
          .map(async (img) => ({
            imageId: img.imageId,
            blobUrl: await signedImageUrl(img.pathname, validUntil),
            basename: img.basename,
          })),
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function signedImageUrl(pathname: string, validUntil: number): Promise<string> {
  const token = await issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(token, {
    access: "private",
    operation: "get",
    pathname,
    validUntil,
  });
  return presignedUrl;
}
