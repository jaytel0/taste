import { NextRequest } from "next/server";
import { z } from "zod";

import { ACCEPTED_IMAGE_TYPES, env } from "@/config";
import type { CredentialBundle } from "@/credentials/secrets";
import { readCredentialBundle } from "@/credentials/session";
import { createRun } from "@/db/repository";
import { errorResponse } from "@/http/errors";
import { assertSameOrigin, enforceRateLimit } from "@/http/security";

const createRunSchema = z.object({
  expectedImageCount: z.number().int().positive().optional(),
}).strict();

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    await enforceRateLimit(request, { bucket: "runs:create", limit: 20, windowSeconds: 60 * 60 });
    const body = createRunSchema.parse(await request.json());
    if (
      body.expectedImageCount !== undefined &&
      body.expectedImageCount > env().MAX_IMAGES_PER_RUN
    ) {
      return Response.json(
        { error: `expectedImageCount cannot exceed ${env().MAX_IMAGES_PER_RUN}` },
        { status: 400 },
      );
    }
    const credentialBundle = await resolveCredentialBundle(request);
    const { run, runSecret } = await createRun({
      credentialBundle,
      maxImages: env().MAX_IMAGES_PER_RUN,
      ...(body.expectedImageCount === undefined ? {} : { expectedImageCount: body.expectedImageCount }),
    });
    return Response.json({
      runId: run.id,
      runSecret,
      credentialMode: run.credentialMode,
      maxImages: run.maxImages,
      maxImageBytes: env().MAX_IMAGE_BYTES,
      acceptedTypes: [...ACCEPTED_IMAGE_TYPES],
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function resolveCredentialBundle(
  request: NextRequest,
): Promise<CredentialBundle> {
  const cookieBundle = await readCredentialBundle(request);
  if (cookieBundle) return cookieBundle;
  throw new Error("Connect OpenRouter before creating a run.");
}
