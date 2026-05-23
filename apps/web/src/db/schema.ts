import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const runs = pgTable("runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  status: text("status").notNull().default("uploading"),
  runSecretHash: text("run_secret_hash").notNull(),
  credentialMode: text("credential_mode").notNull().default("openrouter"),
  encryptedCredentials: text("encrypted_credentials"),
  credentialsIv: text("credentials_iv"),
  credentialsTag: text("credentials_tag"),
  expectedImageCount: integer("expected_image_count"),
  maxImages: integer("max_images").notNull().default(100),
  imageCount: integer("image_count").notNull().default(0),
  analysisTotal: integer("analysis_total").notNull().default(0),
  rawAnalysisCount: integer("raw_analysis_count").notNull().default(0),
  synthesizedNoteCount: integer("synthesized_note_count").notNull().default(0),
  ruleChunkTotal: integer("rule_chunk_total").notNull().default(0),
  ruleChunkCount: integer("rule_chunk_count").notNull().default(0),
  progressPercent: integer("progress_percent").notNull().default(0),
  currentStep: text("current_step").notNull().default("Waiting for uploads"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const credentialSessions = pgTable("credential_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionSecretHash: text("session_secret_hash").notNull(),
  encryptedCredentials: text("encrypted_credentials").notNull(),
  credentialsIv: text("credentials_iv").notNull(),
  credentialsTag: text("credentials_tag").notNull(),
  source: text("source").notNull(),
  label: text("label"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const referenceImages = pgTable(
  "reference_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    imageId: text("image_id"),
    uploadOrder: integer("upload_order").notNull(),
    basename: text("basename").notNull(),
    blobUrl: text("blob_url").notNull(),
    downloadUrl: text("download_url"),
    pathname: text("pathname").notNull(),
    contentType: text("content_type").notNull(),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256"),
    width: integer("width"),
    height: integer("height"),
    isDuplicate: boolean("is_duplicate").notNull().default(false),
    duplicateOfImageId: text("duplicate_of_image_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    runPathUnique: uniqueIndex("reference_images_run_path_unique").on(table.runId, table.pathname),
    runImageUnique: uniqueIndex("reference_images_run_image_unique").on(table.runId, table.imageId),
    runUploadOrderUnique: uniqueIndex("reference_images_run_upload_order_unique").on(
      table.runId,
      table.uploadOrder,
    ),
  }),
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    imageId: text("image_id").notNull().default(""),
    model: text("model").notNull().default(""),
    chunkId: text("chunk_id").notNull().default(""),
    blobUrl: text("blob_url"),
    pathname: text("pathname"),
    content: text("content"),
    bytes: integer("bytes").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    artifactUnique: uniqueIndex("artifacts_run_type_scope_unique").on(
      table.runId,
      table.type,
      table.imageId,
      table.model,
      table.chunkId,
    ),
  }),
);

export const runEvents = pgTable("run_events", {
  id: serial("id").primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  message: text("message").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    bucket: text("bucket").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    rateLimitUnique: uniqueIndex("rate_limits_key_bucket_window_unique").on(
      table.key,
      table.bucket,
      table.windowStart,
    ),
  }),
);

export const workflowJobs = pgTable(
  "workflow_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(6),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lockedBy: text("locked_by"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    workflowJobsDedupeUnique: uniqueIndex("workflow_jobs_dedupe_unique").on(table.dedupeKey),
  }),
);

export const runRelations = relations(runs, ({ many }) => ({
  images: many(referenceImages),
  artifacts: many(artifacts),
  events: many(runEvents),
  jobs: many(workflowJobs),
}));

export const referenceImageRelations = relations(referenceImages, ({ one }) => ({
  run: one(runs, {
    fields: [referenceImages.runId],
    references: [runs.id],
  }),
}));

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type CredentialSession = typeof credentialSessions.$inferSelect;
export type ReferenceImage = typeof referenceImages.$inferSelect;
export type NewReferenceImage = typeof referenceImages.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type RunEvent = typeof runEvents.$inferSelect;
export type WorkflowJob = typeof workflowJobs.$inferSelect;
