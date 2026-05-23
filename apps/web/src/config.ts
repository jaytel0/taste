import { z } from "zod";

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_ENCRYPTION_KEY: z.string().min(32),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  MAX_IMAGES_PER_RUN: z.coerce.number().int().positive().default(100),
  MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
  RUN_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
  STALE_RUN_CREDENTIAL_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  CREDENTIAL_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24),
  INTERNAL_API_SECRET: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  WORKFLOW_DRAIN_CONCURRENCY: z.coerce.number().int().positive().default(8),
  WORKFLOW_DRAIN_MAX_JOBS: z.coerce.number().int().positive().default(24),
  WORKFLOW_JOB_LEASE_SECONDS: z.coerce.number().int().positive().default(600),
  WORKFLOW_JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(6),
  ANALYSIS_MODELS: z
    .string()
    .default("openai/gpt-5.5,anthropic/claude-sonnet-4-6"),
  SYNTHESIS_MODEL: z.string().default("openai/gpt-5.5"),
  RULE_MODEL: z.string().default("openai/gpt-5.5"),
  SKILL_MODEL: z.string().default("openai/gpt-5.5"),
  RULE_CHUNK_SIZE: z.coerce.number().int().positive().default(10),
  RULE_MERGE_FAN_IN: z.coerce.number().int().min(2).default(6),
});

const productionRequiredFields = ["INTERNAL_API_SECRET", "CRON_SECRET"] as const;

export class AppConfigError extends Error {
  readonly code = "server_config";
  readonly status = 500;

  constructor(readonly fields: string[]) {
    super(
      fields.length > 0
        ? `Server configuration is missing or invalid: ${fields.join(", ")}.`
        : "Server configuration is missing or invalid.",
    );
    this.name = "AppConfigError";
  }
}

export function env() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new AppConfigError(
      Array.from(
        new Set(
          parsed.error.issues.map((issue) =>
            typeof issue.path[0] === "string" ? issue.path[0] : "environment",
          ),
        ),
      ),
    );
  }
  if (process.env.NODE_ENV === "production") {
    const missing = productionRequiredFields.filter((field) => !parsed.data[field]);
    if (missing.length > 0) {
      throw new AppConfigError(missing);
    }
  }
  return parsed.data;
}

export function analysisModels(): string[] {
  return env()
    .ANALYSIS_MODELS.split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}
