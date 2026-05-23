import { NextRequest } from "next/server";
import { z } from "zod";

import { ACCEPTED_IMAGE_TYPES, env } from "@/config";
import type { CredentialBundle } from "@/credentials/secrets";
import { readCredentialBundle } from "@/credentials/session";
import { createRun } from "@/db/repository";
import { errorResponse } from "@/http/errors";
import { assertSameOrigin, enforceRateLimit } from "@/http/security";

const createRunSchema = z.object({
  credentialMode: z.enum(["openrouter", "direct"]).optional(),
  expectedImageCount: z.number().int().positive().optional(),
});

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
    const credentialBundle = await resolveCredentialBundle(request, body);
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
  body: z.infer<typeof createRunSchema>,
): Promise<CredentialBundle> {
  const cookieBundle = await readCredentialBundle(request);
  if (cookieBundle) {
    if (body.credentialMode && cookieBundle.credentials.mode !== body.credentialMode) {
      throw new Error(`Connected credential mode is ${cookieBundle.credentials.mode}, not ${body.credentialMode}.`);
    }
    return cookieBundle;
  }

  if (body.credentialMode === "openrouter" || body.credentialMode === "direct") {
    throw new Error(`Connect ${body.credentialMode} credentials before creating a run.`);
  }

  throw new Error("Connect OpenRouter or provide direct API keys before creating a run.");
}
