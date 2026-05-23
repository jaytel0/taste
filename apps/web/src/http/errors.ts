import { ZodError } from "zod";

import { AppConfigError } from "@/config";
import { redactSecrets } from "@/credentials/redact";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorResponse(error: unknown, fallbackStatus = 400): Response {
  if (error instanceof HttpError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof AppConfigError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          fields: error.fields,
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    const fields = Array.from(
      new Set(
        error.issues
          .map((issue) => issue.path.join("."))
          .filter((path) => path.length > 0),
      ),
    );
    return Response.json(
      {
        error: {
          code: "invalid_request",
          message:
            fields.length > 0
              ? `Invalid request field(s): ${fields.join(", ")}.`
              : "Invalid request.",
          fields,
        },
      },
      { status: 400 },
    );
  }

  const message = redactSecrets(error instanceof Error ? error.message : String(error));
  return Response.json(
    {
      error: {
        code: "request_failed",
        message,
      },
    },
    { status: fallbackStatus },
  );
}
