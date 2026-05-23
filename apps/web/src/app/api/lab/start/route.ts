import { z } from "zod";

import {
  DEFAULT_GENERATOR_MODEL,
  DEFAULT_RESEARCHER_MODEL,
  DEFAULT_TASK_PROMPT,
} from "@/lab/defaults";
import { startLabSession } from "@/lab/engine";
import { errorResponse } from "@/http/errors";

export const runtime = "nodejs";

const startSchema = z.object({
  baseSkill: z.string().min(20),
  sourceRuleSet: z.string().min(100),
  taskPrompt: z.string().trim().min(3).default(DEFAULT_TASK_PROMPT),
  generatorModel: z.string().trim().min(1).default(DEFAULT_GENERATOR_MODEL),
  researcherModel: z.string().trim().min(1).default(DEFAULT_RESEARCHER_MODEL),
  candidateCount: z.number().int().min(1).max(4).default(3),
  openrouterApiKey: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export async function POST(request: Request) {
  try {
    const body = startSchema.parse(await request.json());
    const response = await startLabSession(body);
    return Response.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}
