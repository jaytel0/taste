import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest } from "next/server";
import { z } from "zod";

import { ACCEPTED_IMAGE_TYPES, env } from "@/config";
import {
  requireRun,
  registerUploadedImage,
  uploadedImageCount,
  verifyRunSecret,
} from "@/db/repository";
import { errorResponse } from "@/http/errors";
import { assertSameOrigin, enforceRateLimit } from "@/http/security";
import { deleteBlobPathnames } from "@/storage/blob";

const clientPayloadSchema = z.object({
  runId: z.string().uuid(),
  runSecret: z.string().min(1),
  uploadOrder: z.number().int().nonnegative().optional(),
  fileName: z.string().min(1).optional(),
  contentType: z.string().min(1).optional(),
  size: z.number().int().nonnegative().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    await enforceRateLimit(request, { bucket: "uploads", limit: 1000, windowSeconds: 15 * 60 });
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = clientPayloadSchema.parse(JSON.parse(clientPayload ?? "{}"));
        const run = await verifyRunSecret(payload.runId, payload.runSecret);
        if (run.status !== "uploading") {
          throw new Error("Run is no longer accepting uploads");
        }
        const count = await uploadedImageCount(payload.runId);
        const uploadOrder = payload.uploadOrder ?? count;
        if (uploadOrder >= run.maxImages) {
          throw new Error(`Run cannot exceed ${run.maxImages} images`);
        }
        if (run.expectedImageCount !== null && uploadOrder >= run.expectedImageCount) {
          throw new Error(`Run expects ${run.expectedImageCount} images`);
        }
        if (count >= run.maxImages) {
          throw new Error(`Run cannot exceed ${run.maxImages} images`);
        }
        if (payload.size !== undefined && payload.size > env().MAX_IMAGE_BYTES) {
          throw new Error(`Image exceeds ${env().MAX_IMAGE_BYTES} bytes`);
        }
        if (
          payload.contentType !== undefined &&
          !ACCEPTED_IMAGE_TYPES.includes(payload.contentType as (typeof ACCEPTED_IMAGE_TYPES)[number])
        ) {
          throw new Error(`Unsupported image type: ${payload.contentType}`);
        }
        return {
          allowedContentTypes: [...ACCEPTED_IMAGE_TYPES],
          maximumSizeInBytes: env().MAX_IMAGE_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            runId: payload.runId,
            uploadOrder,
            originalPathname: pathname,
            fileName: payload.fileName,
            contentType: payload.contentType,
            size: payload.size,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = z
          .object({
            runId: z.string().uuid(),
            uploadOrder: z.number().int().nonnegative(),
            originalPathname: z.string().optional(),
            fileName: z.string().min(1).optional(),
            contentType: z.string().min(1).optional(),
            size: z.number().int().nonnegative().optional(),
          })
          .parse(JSON.parse(tokenPayload ?? "{}"));
        try {
          const run = await requireRun(payload.runId);
          if (run.status !== "uploading") {
            throw new Error("Run is no longer accepting uploads");
          }
          if (payload.uploadOrder >= run.maxImages) {
            throw new Error(`Run cannot exceed ${run.maxImages} images`);
          }
          if (run.expectedImageCount !== null && payload.uploadOrder >= run.expectedImageCount) {
            throw new Error(`Run expects ${run.expectedImageCount} images`);
          }
          await registerUploadedImage({
            runId: payload.runId,
            uploadOrder: payload.uploadOrder,
            basename:
              payload.fileName ??
              payload.originalPathname?.split("/").pop() ??
              blob.pathname.split("/").pop() ??
              "image",
            blobUrl: blob.url,
            downloadUrl: "downloadUrl" in blob ? String(blob.downloadUrl) : null,
            pathname: blob.pathname,
            contentType: blob.contentType ?? payload.contentType ?? "application/octet-stream",
            bytes: (blob as { size?: number }).size ?? payload.size ?? 0,
          });
        } catch (error) {
          await deleteBlobPathnames([blob.pathname]).catch(() => {});
          throw error;
        }
      },
    });
    return Response.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}
