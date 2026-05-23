import { head } from "@vercel/blob";
import { NextRequest } from "next/server";
import { z } from "zod";

import { ACCEPTED_IMAGE_TYPES, env } from "@/config";
import { registerUploadedImage } from "@/db/repository";
import { routeParams, requireRunAccess } from "@/http/auth";
import { errorResponse } from "@/http/errors";
import { assertSameOrigin } from "@/http/security";
import { uploadPrefix } from "@/uploads/path";

const completeSchema = z.object({
  uploadOrder: z.number().int().nonnegative(),
  basename: z.string().min(1),
  blobUrl: z.string().url(),
  downloadUrl: z.string().url().optional().nullable(),
  pathname: z.string().min(1),
  contentType: z.string().min(1),
  bytes: z.number().int().nonnegative(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await routeParams(context);
  try {
    await assertSameOrigin(request);
    const access = await requireRunAccess(request, runId);
    if (!access.ok) return access.response;
    if (access.run.status !== "uploading") {
      return Response.json({ error: "Run is no longer accepting uploads" }, { status: 409 });
    }
    const body = completeSchema.parse(await request.json());
    if (body.bytes > env().MAX_IMAGE_BYTES) {
      return Response.json({ error: `Image exceeds ${env().MAX_IMAGE_BYTES} bytes` }, { status: 400 });
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(body.contentType as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
      return Response.json({ error: `Unsupported image type: ${body.contentType}` }, { status: 400 });
    }
    if (body.uploadOrder >= access.run.maxImages) {
      return Response.json({ error: `Run cannot exceed ${access.run.maxImages} images` }, { status: 400 });
    }
    if (access.run.expectedImageCount !== null && body.uploadOrder >= access.run.expectedImageCount) {
      return Response.json({ error: `Run expects ${access.run.expectedImageCount} images` }, { status: 400 });
    }
    if (!body.pathname.startsWith(uploadPrefix(runId, body.uploadOrder))) {
      return Response.json({ error: "Image does not belong to this run" }, { status: 400 });
    }
    const verified = await head(body.pathname).catch(() => null);
    if (!verified) {
      return Response.json({ error: "Uploaded image could not be verified" }, { status: 400 });
    }
    if (verified.pathname !== body.pathname) {
      return Response.json({ error: "Uploaded image could not be verified" }, { status: 400 });
    }
    if (verified.size !== body.bytes) {
      return Response.json({ error: "Uploaded image size did not match" }, { status: 400 });
    }
    const contentType = verified.contentType ?? body.contentType;
    if (contentType !== body.contentType) {
      return Response.json({ error: "Uploaded image content type did not match" }, { status: 400 });
    }
    const image = await registerUploadedImage({
      runId,
      uploadOrder: body.uploadOrder,
      basename: body.basename,
      blobUrl: verified.url || body.blobUrl,
      downloadUrl: verified.downloadUrl || body.downloadUrl,
      pathname: body.pathname,
      contentType,
      bytes: verified.size,
    });
    return Response.json({ imageId: image.id });
  } catch (error) {
    return errorResponse(error);
  }
}
