import { readFile } from "node:fs/promises";

import { LOCAL_SOURCE_RULE_SET_PATH } from "@/lab/local-files";

export const runtime = "nodejs";

export async function GET() {
  try {
    const content = await readFile(LOCAL_SOURCE_RULE_SET_PATH, "utf8");
    return Response.json({
      content,
      path: LOCAL_SOURCE_RULE_SET_PATH,
      found: true,
    });
  } catch (error) {
    return Response.json({
      content: "",
      path: LOCAL_SOURCE_RULE_SET_PATH,
      found: false,
      warning:
        error instanceof Error
          ? error.message
          : "Source rule set markdown could not be loaded.",
    });
  }
}
