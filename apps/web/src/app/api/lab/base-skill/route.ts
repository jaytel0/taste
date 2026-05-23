import { readFile } from "node:fs/promises";

import { errorResponse } from "@/http/errors";
import { DEFAULT_SKILL } from "@/lab/default-skill";
import { LOCAL_BASE_SKILL_PATH } from "@/lab/local-files";

export const runtime = "nodejs";

export async function GET() {
  try {
    const content = await readFile(LOCAL_BASE_SKILL_PATH, "utf8");
    return Response.json({ content, path: LOCAL_BASE_SKILL_PATH, fallback: false });
  } catch (error) {
    if (process.env.NODE_ENV === "production") return errorResponse(error, 500);
    return Response.json({
      content: DEFAULT_SKILL,
      path: null,
      fallback: true,
      warning: error instanceof Error ? error.message : String(error),
    });
  }
}
