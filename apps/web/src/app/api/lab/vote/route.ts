import { z } from "zod";

import { errorResponse } from "@/http/errors";
import { voteAndAdvance } from "@/lab/engine";

export const runtime = "nodejs";

const voteSchema = z.object({
  sessionId: z.string().min(1),
  roundId: z.string().min(1),
  winnerCandidateId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  openrouterApiKey: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  useMock: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const body = voteSchema.parse(await request.json());
    const response = await voteAndAdvance(body);
    return Response.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}
