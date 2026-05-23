import { and, asc, count, eq, gt, inArray, isNull, lt, not, or, sql } from "drizzle-orm";
import type { AiProviderCredentials } from "@taste/ai";

import { env } from "@/config";
import { redactSecrets } from "@/credentials/redact";
import {
  decryptCredentialBundle,
  encryptCredentialBundle,
  type CredentialBundle,
} from "@/credentials/secrets";
import { createSecret, hashSecret, safeEqualHash } from "@/crypto/secrets";
import { db } from "./client";
import {
  artifacts,
  credentialSessions,
  rateLimits,
  referenceImages,
  runEvents,
  runs,
  workflowJobs,
  type Artifact,
  type NewArtifact,
  type ReferenceImage,
  type Run,
  type RunEvent,
  type WorkflowJob,
} from "./schema";

export type RunStatus =
  | "uploading"
  | "queued"
  | "indexing"
  | "analyzing"
  | "synthesizing_notes"
  | "extracting_rules"
  | "generating_skill"
  | "complete"
  | "failed"
  | "canceled";

export type WorkflowJobStatus = "queued" | "running" | "retrying" | "complete" | "failed" | "canceled";

const terminalRunStatuses: RunStatus[] = ["complete", "failed", "canceled"];
const activeRunStatuses: RunStatus[] = [
  "uploading",
  "queued",
  "indexing",
  "analyzing",
  "synthesizing_notes",
  "extracting_rules",
  "generating_skill",
];

export class RunCanceledError extends Error {
  constructor(runId: string) {
    super(`Run ${runId} was canceled`);
    this.name = "RunCanceledError";
  }
}

export function isRunCanceledError(error: unknown): error is RunCanceledError {
  return error instanceof RunCanceledError;
}

function activeRunWhere(runId: string) {
  return and(eq(runs.id, runId), not(inArray(runs.status, terminalRunStatuses)));
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export async function createRun(input: {
  credentialBundle: CredentialBundle;
  expectedImageCount?: number | undefined;
  maxImages?: number | undefined;
}) {
  const runSecret = createSecret();
  const now = new Date();
  const encryptedCredentials = encryptCredentialBundle(input.credentialBundle);
  const [run] = await db
    .insert(runs)
    .values({
      runSecretHash: hashSecret(runSecret),
      credentialMode: input.credentialBundle.credentials.mode,
      encryptedCredentials: encryptedCredentials.ciphertext,
      credentialsIv: encryptedCredentials.iv,
      credentialsTag: encryptedCredentials.tag,
      expectedImageCount: input.expectedImageCount,
      maxImages: input.maxImages ?? env().MAX_IMAGES_PER_RUN,
      expiresAt: addHours(now, env().RUN_RETENTION_HOURS),
    })
    .returning();
  if (!run) throw new Error("Failed to create run");
  await appendRunEvent(run.id, "run.created", "Run created", {
    credentialMode: input.credentialBundle.credentials.mode,
    credentialSource: input.credentialBundle.source,
  });
  return { run, runSecret };
}

export async function createCredentialSession(input: CredentialBundle) {
  const now = new Date();
  const sessionSecret = createSecret();
  const expiresAt = input.expiresAt
    ? new Date(input.expiresAt)
    : addHours(now, env().CREDENTIAL_SESSION_TTL_HOURS);
  const bundle = {
    ...input,
    expiresAt: expiresAt.toISOString(),
  } satisfies CredentialBundle;
  const encrypted = encryptCredentialBundle(bundle);
  const [session] = await db
    .insert(credentialSessions)
    .values({
      sessionSecretHash: hashSecret(sessionSecret),
      encryptedCredentials: encrypted.ciphertext,
      credentialsIv: encrypted.iv,
      credentialsTag: encrypted.tag,
      source: bundle.source,
      label: bundle.label ?? null,
      connectedAt: new Date(bundle.connectedAt),
      expiresAt,
    })
    .returning();
  if (!session) throw new Error("Failed to create credential session");
  return { session, sessionSecret, bundle };
}

export async function readCredentialSession(
  sessionId: string,
  sessionSecret: string,
): Promise<CredentialBundle | null> {
  const [session] = await db
    .select()
    .from(credentialSessions)
    .where(and(eq(credentialSessions.id, sessionId), gt(credentialSessions.expiresAt, new Date())))
    .limit(1);
  if (!session || !safeEqualHash(sessionSecret, session.sessionSecretHash)) return null;
  await db
    .update(credentialSessions)
    .set({ updatedAt: new Date() })
    .where(eq(credentialSessions.id, session.id));
  return decryptCredentialBundle({
    ciphertext: session.encryptedCredentials,
    iv: session.credentialsIv,
    tag: session.credentialsTag,
  });
}

export async function deleteCredentialSession(sessionId: string) {
  await db.delete(credentialSessions).where(eq(credentialSessions.id, sessionId));
}

export async function purgeExpiredCredentialSessions(now = new Date()) {
  await db.delete(credentialSessions).where(lt(credentialSessions.expiresAt, now));
}

export async function getRun(runId: string): Promise<Run | null> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  return run ?? null;
}

export async function requireRun(runId: string): Promise<Run> {
  const run = await getRun(runId);
  if (!run) throw new Error("Run not found");
  return run;
}

export async function verifyRunSecret(runId: string, runSecret: string): Promise<Run> {
  const run = await requireRun(runId);
  if (!safeEqualHash(runSecret, run.runSecretHash)) {
    throw new Error("Invalid run secret");
  }
  return run;
}

export function decryptRunCredentials(
  run: Pick<Run, "encryptedCredentials" | "credentialsIv" | "credentialsTag">,
): AiProviderCredentials {
  if (run.encryptedCredentials && run.credentialsIv && run.credentialsTag) {
    return decryptCredentialBundle({
      ciphertext: run.encryptedCredentials,
      iv: run.credentialsIv,
      tag: run.credentialsTag,
    }).credentials;
  }

  throw new Error("Run is missing AI provider credentials.");
}

export async function purgeRunCredentials(runId: string) {
  await db
    .update(runs)
    .set({
      encryptedCredentials: null,
      credentialsIv: null,
      credentialsTag: null,
      updatedAt: new Date(),
    })
    .where(eq(runs.id, runId));
}

export async function updateRunStatus(
  runId: string,
  status: RunStatus,
  fields: Partial<Pick<Run, "currentStep" | "errorMessage" | "progressPercent" | "completedAt">> = {},
) {
  const updated = await db
    .update(runs)
    .set({
      status,
      ...fields,
      updatedAt: new Date(),
    })
    .where(activeRunWhere(runId))
    .returning({ id: runs.id });
  return updated.length > 0;
}

export async function failRun(runId: string, error: unknown) {
  const run = await getRun(runId);
  if (run?.status === "canceled" || run?.status === "complete") return;
  const message = redactSecrets(error instanceof Error ? error.message : String(error));
  await updateRunStatus(runId, "failed", {
    currentStep: "Failed",
    errorMessage: message,
  });
  await purgeRunCredentials(runId);
  await cancelOpenWorkflowJobs(runId, "failed");
  await appendRunEvent(runId, "run.failed", message);
}

export async function cancelRun(runId: string) {
  const run = await requireRun(runId);
  if (terminalRunStatuses.includes(run.status as RunStatus)) {
    await purgeRunCredentials(runId);
    return run;
  }
  const canceled = await updateRunStatus(runId, "canceled", {
    currentStep: "Canceled",
    progressPercent: run.progressPercent,
    completedAt: new Date(),
  });
  await purgeRunCredentials(runId);
  await cancelOpenWorkflowJobs(runId, "canceled");
  if (canceled) await appendRunEvent(runId, "run.canceled", "Run canceled");
  return requireRun(runId);
}

export async function throwIfRunCanceled(runId: string) {
  const run = await requireRun(runId);
  if (run.status === "canceled") throw new RunCanceledError(runId);
}

export async function registerUploadedImage(input: {
  runId: string;
  uploadOrder: number;
  basename: string;
  blobUrl: string;
  downloadUrl?: string | null | undefined;
  pathname: string;
  contentType: string;
  bytes: number;
}) {
  const [image] = await db
    .insert(referenceImages)
    .values({
      runId: input.runId,
      uploadOrder: input.uploadOrder,
      basename: input.basename,
      blobUrl: input.blobUrl,
      downloadUrl: input.downloadUrl ?? null,
      pathname: input.pathname,
      contentType: input.contentType,
      bytes: input.bytes,
    })
    .onConflictDoUpdate({
      target: [referenceImages.runId, referenceImages.uploadOrder],
      set: {
        basename: input.basename,
        blobUrl: input.blobUrl,
        downloadUrl: input.downloadUrl ?? null,
        pathname: input.pathname,
        contentType: input.contentType,
        bytes: input.bytes,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!image) throw new Error("Failed to register uploaded image");
  await appendRunEvent(input.runId, "image.uploaded", `Uploaded ${input.basename}`, {
    pathname: input.pathname,
    bytes: input.bytes,
  });
  return image;
}

export async function listImages(runId: string): Promise<ReferenceImage[]> {
  return db
    .select()
    .from(referenceImages)
    .where(eq(referenceImages.runId, runId))
    .orderBy(asc(referenceImages.uploadOrder), asc(referenceImages.createdAt));
}

export async function listActiveImages(runId: string): Promise<ReferenceImage[]> {
  return db
    .select()
    .from(referenceImages)
    .where(and(eq(referenceImages.runId, runId), eq(referenceImages.isDuplicate, false)))
    .orderBy(asc(referenceImages.uploadOrder), asc(referenceImages.createdAt));
}

export async function getImageByImageId(runId: string, imageId: string): Promise<ReferenceImage> {
  const [image] = await db
    .select()
    .from(referenceImages)
    .where(and(eq(referenceImages.runId, runId), eq(referenceImages.imageId, imageId)))
    .limit(1);
  if (!image) throw new Error(`Image not found: ${imageId}`);
  return image;
}

export async function updateImageIndex(input: {
  rowId: string;
  imageId: string | null;
  sha256: string;
  width: number | null;
  height: number | null;
  isDuplicate: boolean;
  duplicateOfImageId: string | null;
}) {
  await db
    .update(referenceImages)
    .set({
      imageId: input.imageId,
      sha256: input.sha256,
      width: input.width,
      height: input.height,
      isDuplicate: input.isDuplicate,
      duplicateOfImageId: input.duplicateOfImageId,
      updatedAt: new Date(),
    })
    .where(eq(referenceImages.id, input.rowId));
}

export async function setRunIndexed(input: {
  runId: string;
  imageCount: number;
  analysisTotal: number;
}) {
  await db
    .update(runs)
    .set({
      status: "analyzing",
      imageCount: input.imageCount,
      analysisTotal: input.analysisTotal,
      currentStep: "Analyzing reference images",
      progressPercent: 5,
      updatedAt: new Date(),
    })
    .where(activeRunWhere(input.runId));
}

export async function setRawAnalysisCount(runId: string, value: number) {
  await db
    .update(runs)
    .set({
      rawAnalysisCount: value,
      updatedAt: new Date(),
    })
    .where(activeRunWhere(runId));
}

export async function setSynthesizedNoteCount(runId: string, value: number) {
  await db
    .update(runs)
    .set({
      status: "synthesizing_notes",
      synthesizedNoteCount: value,
      currentStep: "Synthesizing image notes",
      updatedAt: new Date(),
    })
    .where(activeRunWhere(runId));
}

export async function setRuleChunkTotal(runId: string, total: number) {
  await db
    .update(runs)
    .set({
      ruleChunkTotal: total,
      ruleChunkCount: 0,
      updatedAt: new Date(),
    })
    .where(activeRunWhere(runId));
}

export async function setRuleChunkCount(runId: string, value: number) {
  await db
    .update(runs)
    .set({
      ruleChunkCount: value,
      updatedAt: new Date(),
    })
    .where(activeRunWhere(runId));
}

export async function claimStatus(
  runId: string,
  from: RunStatus,
  to: RunStatus,
  currentStep: string,
  fields: Partial<Pick<Run, "progressPercent" | "errorMessage" | "completedAt">> = {},
) {
  const claimed = await db
    .update(runs)
    .set({
      status: to,
      currentStep,
      ...fields,
      updatedAt: new Date(),
    })
    .where(and(eq(runs.id, runId), eq(runs.status, from)))
    .returning({ id: runs.id });
  return claimed.length > 0;
}

export async function storeArtifact(input: NewArtifact): Promise<Artifact> {
  await throwIfRunCanceled(input.runId);
  const [artifact] = await db
    .insert(artifacts)
    .values(input)
    .onConflictDoUpdate({
      target: [
        artifacts.runId,
        artifacts.type,
        artifacts.imageId,
        artifacts.model,
        artifacts.chunkId,
      ],
      set: {
        blobUrl: input.blobUrl ?? null,
        pathname: input.pathname ?? null,
        content: input.content ?? null,
        bytes: input.bytes ?? 0,
        metadata: input.metadata ?? {},
        createdAt: new Date(),
      },
    })
    .returning();
  if (!artifact) throw new Error("Failed to store artifact");
  return artifact;
}

export async function listArtifacts(runId: string, type: string): Promise<Artifact[]> {
  return db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.runId, runId), eq(artifacts.type, type)))
    .orderBy(asc(artifacts.imageId), asc(artifacts.chunkId), asc(artifacts.model));
}

export async function getArtifact(input: {
  runId: string;
  type: string;
  imageId?: string;
  model?: string;
  chunkId?: string;
}): Promise<Artifact | null> {
  const clauses = [eq(artifacts.runId, input.runId), eq(artifacts.type, input.type)];
  if (input.imageId !== undefined) clauses.push(eq(artifacts.imageId, input.imageId));
  if (input.model !== undefined) clauses.push(eq(artifacts.model, input.model));
  if (input.chunkId !== undefined) clauses.push(eq(artifacts.chunkId, input.chunkId));
  const [artifact] = await db
    .select()
    .from(artifacts)
    .where(and(...clauses))
    .limit(1);
  return artifact ?? null;
}

export async function countArtifacts(runId: string, type: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(artifacts)
    .where(and(eq(artifacts.runId, runId), eq(artifacts.type, type)));
  return row?.value ?? 0;
}

export async function appendRunEvent(
  runId: string,
  type: string,
  message: string,
  data: Record<string, unknown> = {},
): Promise<RunEvent> {
  const [event] = await db
    .insert(runEvents)
    .values({ runId, type, message, data })
    .returning();
  if (!event) throw new Error("Failed to append run event");
  return event;
}

export async function listRunEvents(runId: string, afterId = 0): Promise<RunEvent[]> {
  return db
    .select()
    .from(runEvents)
    .where(and(eq(runEvents.runId, runId), gt(runEvents.id, afterId)))
    .orderBy(asc(runEvents.id));
}

export async function uploadedImageCount(runId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(referenceImages)
    .where(eq(referenceImages.runId, runId));
  return row?.value ?? 0;
}

export async function incrementRateLimit(input: {
  key: string;
  bucket: string;
  windowStart: Date;
}): Promise<number> {
  const [row] = await db
    .insert(rateLimits)
    .values({
      key: input.key,
      bucket: input.bucket,
      windowStart: input.windowStart,
      count: 1,
    })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.bucket, rateLimits.windowStart],
      set: {
        count: sql`${rateLimits.count} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ count: rateLimits.count });
  return row?.count ?? 1;
}

export async function enqueueWorkflowJob(input: {
  runId: string;
  type: string;
  dedupeKey: string;
  payload?: Record<string, unknown> | undefined;
  runAfter?: Date | undefined;
  maxAttempts?: number | undefined;
}): Promise<WorkflowJob | null> {
  const [job] = await db
    .insert(workflowJobs)
    .values({
      runId: input.runId,
      type: input.type,
      dedupeKey: input.dedupeKey,
      payload: input.payload ?? {},
      runAfter: input.runAfter ?? new Date(),
      maxAttempts: input.maxAttempts ?? env().WORKFLOW_JOB_MAX_ATTEMPTS,
    })
    .onConflictDoNothing({ target: workflowJobs.dedupeKey })
    .returning();
  return job ?? null;
}

export async function claimNextWorkflowJob(input: {
  workerId: string;
  leaseUntil: Date;
  now?: Date | undefined;
}): Promise<WorkflowJob | null> {
  const now = input.now ?? new Date();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [candidate] = await db
      .select()
      .from(workflowJobs)
      .where(
        and(
          inArray(workflowJobs.status, ["queued", "retrying"]),
          sql`${workflowJobs.runAfter} <= ${now}`,
        ),
      )
      .orderBy(asc(workflowJobs.runAfter), asc(workflowJobs.createdAt))
      .limit(1);
    if (!candidate) return null;
    const [claimed] = await db
      .update(workflowJobs)
      .set({
        status: "running",
        attempts: candidate.attempts + 1,
        lockedBy: input.workerId,
        lockedUntil: input.leaseUntil,
        updatedAt: now,
      })
      .where(
        and(
          eq(workflowJobs.id, candidate.id),
          inArray(workflowJobs.status, ["queued", "retrying"]),
          sql`${workflowJobs.runAfter} <= ${now}`,
        ),
      )
      .returning();
    if (claimed) return claimed;
  }
  return null;
}

export async function completeWorkflowJob(jobId: string) {
  await db
    .update(workflowJobs)
    .set({
      status: "complete",
      lockedBy: null,
      lockedUntil: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(workflowJobs.id, jobId));
}

export async function retryWorkflowJob(job: WorkflowJob, error: unknown) {
  const message = redactSecrets(error instanceof Error ? error.message : String(error));
  const exhausted = job.attempts >= job.maxAttempts;
  await db
    .update(workflowJobs)
    .set({
      status: exhausted ? "failed" : "retrying",
      runAfter: exhausted ? job.runAfter : retryAfter(job.attempts),
      lockedBy: null,
      lockedUntil: null,
      lastError: message,
      updatedAt: new Date(),
      ...(exhausted ? { completedAt: new Date() } : {}),
    })
    .where(eq(workflowJobs.id, job.id));
  if (exhausted) {
    await failRun(job.runId, new Error(`Workflow job failed: ${job.type}: ${message}`));
  }
}

export async function recoverExpiredWorkflowJobs(now = new Date()) {
  const exhausted = await db
    .select({
      id: workflowJobs.id,
      runId: workflowJobs.runId,
      type: workflowJobs.type,
      attempts: workflowJobs.attempts,
    })
    .from(workflowJobs)
    .where(
      and(
        eq(workflowJobs.status, "running"),
        sql`${workflowJobs.lockedUntil} < ${now}`,
        sql`${workflowJobs.attempts} >= ${workflowJobs.maxAttempts}`,
      ),
    );
  await db
    .update(workflowJobs)
    .set({
      status: "failed",
      lockedBy: null,
      lockedUntil: null,
      lastError: "Workflow job lease expired after max attempts",
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(workflowJobs.status, "running"),
        sql`${workflowJobs.lockedUntil} < ${now}`,
        sql`${workflowJobs.attempts} >= ${workflowJobs.maxAttempts}`,
      ),
    );
  for (const job of exhausted) {
    await failRun(
      job.runId,
      new Error(`Workflow job lease expired after max attempts: ${job.type} (${job.attempts})`),
    );
  }
  await db
    .update(workflowJobs)
    .set({
      status: "retrying",
      runAfter: now,
      lockedBy: null,
      lockedUntil: null,
      lastError: "Workflow job lease expired",
      updatedAt: now,
    })
    .where(
      and(
        eq(workflowJobs.status, "running"),
        sql`${workflowJobs.lockedUntil} < ${now}`,
        sql`${workflowJobs.attempts} < ${workflowJobs.maxAttempts}`,
      ),
    );
}

export async function hasRunnableWorkflowJobs(now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ value: count() })
    .from(workflowJobs)
    .where(
      and(
        inArray(workflowJobs.status, ["queued", "retrying"]),
        sql`${workflowJobs.runAfter} <= ${now}`,
      ),
    );
  return (row?.value ?? 0) > 0;
}

export async function cancelOpenWorkflowJobs(runId: string, status: "failed" | "canceled") {
  await db
    .update(workflowJobs)
    .set({
      status,
      lockedBy: null,
      lockedUntil: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowJobs.runId, runId),
        inArray(workflowJobs.status, ["queued", "retrying", "running"]),
      ),
    );
}

export async function purgeOldRateLimits(cutoff: Date) {
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, cutoff));
}

export async function blobPathnamesForRun(runId: string): Promise<string[]> {
  const imageRows = await db
    .select({ pathname: referenceImages.pathname })
    .from(referenceImages)
    .where(eq(referenceImages.runId, runId));
  const artifactRows = await db
    .select({ pathname: artifacts.pathname })
    .from(artifacts)
    .where(eq(artifacts.runId, runId));
  return Array.from(
    new Set(
      [...imageRows, ...artifactRows]
        .map((row) => row.pathname)
        .filter((pathname): pathname is string => Boolean(pathname)),
    ),
  );
}

export async function deleteRunRecord(runId: string) {
  await db.delete(runs).where(eq(runs.id, runId));
}

export async function runsNeedingCleanup(now = new Date()): Promise<Array<{ id: string }>> {
  const terminalCutoff = new Date(now.getTime() - env().RUN_RETENTION_HOURS * 60 * 60 * 1000);
  const staleCutoff = addMinutes(now, -env().STALE_RUN_CREDENTIAL_TTL_MINUTES);
  return db
    .select({ id: runs.id })
    .from(runs)
    .where(
      or(
        lt(runs.expiresAt, now),
        and(inArray(runs.status, terminalRunStatuses), lt(runs.updatedAt, terminalCutoff)),
        and(inArray(runs.status, activeRunStatuses), lt(runs.updatedAt, staleCutoff)),
      ),
    );
}

function retryAfter(attempts: number): Date {
  const baseMs = Math.min(5 * 60_000, 1000 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + baseMs + Math.floor(Math.random() * 500));
}

export async function statusPayload(runId: string) {
  const run = await requireRun(runId);
  const latestSkill = await getArtifact({ runId, type: "skill" });
  return {
    id: run.id,
    status: run.status,
    currentStep: run.currentStep,
    errorMessage: run.errorMessage,
    progressPercent: computeProgress(run),
    counts: {
      images: run.imageCount,
      rawAnalyses: run.rawAnalysisCount,
      rawAnalysisTotal: run.analysisTotal,
      synthesizedNotes: run.synthesizedNoteCount,
      ruleChunks: run.ruleChunkCount,
      ruleChunkTotal: run.ruleChunkTotal,
    },
    artifacts: {
      skillReady: Boolean(latestSkill),
    },
    credentials: {
      mode: run.credentialMode,
      stored: Boolean(run.encryptedCredentials),
    },
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
  };
}

function computeProgress(run: Run): number {
  if (run.status === "complete") return 100;
  if (run.status === "failed" || run.status === "canceled") return run.progressPercent;
  const analysis = run.analysisTotal > 0 ? run.rawAnalysisCount / run.analysisTotal : 0;
  const notes = run.imageCount > 0 ? run.synthesizedNoteCount / run.imageCount : 0;
  const chunks = run.ruleChunkTotal > 0 ? run.ruleChunkCount / run.ruleChunkTotal : 0;
  const value = Math.round(5 + analysis * 45 + notes * 30 + chunks * 10);
  return Math.max(run.progressPercent, Math.min(value, 95));
}

export async function nullImageIds(runId: string) {
  return db
    .select()
    .from(referenceImages)
    .where(and(eq(referenceImages.runId, runId), isNull(referenceImages.imageId)));
}
