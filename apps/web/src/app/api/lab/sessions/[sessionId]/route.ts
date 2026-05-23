import { errorResponse } from "@/http/errors";
import { getLabSession } from "@/lab/engine";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params;
    const response = await getLabSession(sessionId);
    return Response.json(response);
  } catch (error) {
    return errorResponse(error, 404);
  }
}
