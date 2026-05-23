import { randomUUID } from "node:crypto";
import { chunkRuleResults } from "@taste/ai";
import { z } from "zod";

import { analysisModels, env } from "@/config";
import {
  appendRunEvent,
  claimNextWorkflowJob,
  claimStatus,
  completeWorkflowJob,
  countArtifacts,
  decryptRunCredentials,
  enqueueWorkflowJob,
  failRun,
  hasRunnableWorkflowJobs,
  listActiveImages,
  recoverExpiredWorkflowJobs,
  requireRun,
  retryWorkflowJob,
  setRunIndexed,
} from "@/db/repository";
import type { WorkflowJob } from "@/db/schema";
import { indexImages } from "@/pipeline/indexing";
import {
  analyzeImageModel,
  rawAnalysisReady,
  synthesizedNoteCount,
  synthesizeOneNote,
} from "@/pipeline/image-stage";
import {
  extractRuleChunkForRun,
  generateFinalSkill,
  prepareRuleChunks,
  ruleResultsForRun,
  synthesizeRuleMergeForRun,
  synthesizeRuleSetForRun,
} from "@/pipeline/rule-stage";
import { mapConcurrent } from "@/pipeline/utils";

type DrainResult = {
  claimed: number;
  completed: number;
  failed: number;
  hasMore: boolean;
};

const rawAnalysisPayload = z.object({
  imageId: z.string().min(1),
  model: z.string().min(1),
});
const imagePayload = z.object({ imageId: z.string().min(1) });
const ruleChunkPayload = z.object({ chunkId: z.string().min(1) });
const reduceRulesPayload = z.object({
  level: z.number().int().positive(),
  sourceType: z.enum(["rule_chunk", "rule_merge"]),
  sourceIds: z.array(z.string()).optional(),
});
const ruleMergePayload = z.object({
  level: z.number().int().positive(),
  mergeId: z.string().min(1),
  sourceType: z.enum(["rule_chunk", "rule_merge"]),
  sourceIds: z.array(z.string()),
  expectedMergeIds: z.array(z.string()),
});
const ruleSetPayload = z.object({
  sourceType: z.enum(["rule_chunk", "rule_merge"]),
  sourceIds: z.array(z.string()),
});

export async function enqueueRunWorkflow(runId: string) {
  await enqueueWorkflowJob({
    runId,
    type: "index",
    dedupeKey: workflowKey(runId, "index"),
  });
}

export async function drainWorkflow(input: {
  maxJobs?: number | undefined;
  concurrency?: number | undefined;
  workerId?: string | undefined;
} = {}): Promise<DrainResult> {
  await recoverExpiredWorkflowJobs();
  const workerId = input.workerId ?? `worker_${randomUUID()}`;
  const maxJobs = input.maxJobs ?? env().WORKFLOW_DRAIN_MAX_JOBS;
  const concurrency = input.concurrency ?? env().WORKFLOW_DRAIN_CONCURRENCY;
  let claimed = 0;
  let completed = 0;
  let failed = 0;

  while (claimed < maxJobs) {
    const remaining = maxJobs - claimed;
    const batchSize = workflowDrainBatchSize(remaining, concurrency);
    const jobs: WorkflowJob[] = [];
    for (let index = 0; index < batchSize; index += 1) {
      const leaseUntil = new Date(Date.now() + env().WORKFLOW_JOB_LEASE_SECONDS * 1000);
      const job = await claimNextWorkflowJob({ workerId, leaseUntil });
      if (!job) break;
      jobs.push(job);
      claimed += 1;
    }
    if (jobs.length === 0) break;

    await mapConcurrent(jobs, concurrency, async (job) => {
      try {
        await executeWorkflowJob(job);
        await completeWorkflowJob(job.id);
        completed += 1;
      } catch (error) {
        await retryWorkflowJob(job, error);
        failed += 1;
      }
    });
  }

  return {
    claimed,
    completed,
    failed,
    hasMore: await hasRunnableWorkflowJobs(),
  };
}

export function workflowDrainBatchSize(remainingJobs: number, concurrency: number): number {
  return Math.max(0, Math.min(remainingJobs, concurrency));
}

export async function kickWorkflowDrain(origin: string | null) {
  const secret = env().INTERNAL_API_SECRET;
  if (origin && secret) {
    await fetch(new URL("/api/jobs/drain", origin), {
      method: "POST",
      headers: { "x-internal-secret": secret },
    }).catch(() => {});
    return;
  }
  await drainWorkflow({ maxJobs: 1, concurrency: 1 });
}

async function executeWorkflowJob(job: WorkflowJob) {
  const run = await requireRun(job.runId);
  if (run.status === "canceled" || run.status === "complete" || run.status === "failed") return;

  switch (job.type) {
    case "index":
      await executeIndexJob(job.runId);
      return;
    case "raw_analysis":
      await executeRawAnalysisJob(job);
      return;
    case "synthesize_note":
      await executeSynthesizeNoteJob(job);
      return;
    case "prepare_rules":
      await executePrepareRulesJob(job.runId);
      return;
    case "rule_chunk":
      await executeRuleChunkJob(job);
      return;
    case "reduce_rules":
      await executeReduceRulesJob(job);
      return;
    case "rule_merge":
      await executeRuleMergeJob(job);
      return;
    case "rule_set":
      await executeRuleSetJob(job);
      return;
    case "skill":
      await executeSkillJob(job.runId);
      return;
    default:
      throw new Error(`Unknown workflow job type: ${job.type}`);
  }
}

async function executeIndexJob(runId: string) {
  const claimed = await claimStatus(runId, "queued", "indexing", "Indexing uploaded reference images", {
    progressPercent: 2,
  });
  const run = await requireRun(runId);
  if (
    !claimed &&
    !["indexing", "analyzing", "synthesizing_notes", "extracting_rules"].includes(run.status)
  ) {
    return;
  }

  const models = analysisModels();
  const activeImages =
    run.status === "analyzing" || run.status === "synthesizing_notes" || run.status === "extracting_rules"
      ? await listActiveImages(runId)
      : await indexAndMarkRun(runId, models);
  for (const image of activeImages) {
    if (!image.imageId) continue;
    for (const model of models) {
      await enqueueWorkflowJob({
        runId,
        type: "raw_analysis",
        dedupeKey: workflowKey(runId, "raw_analysis", image.imageId, model),
        payload: { imageId: image.imageId, model },
      });
    }
  }
}

async function indexAndMarkRun(runId: string, models: string[]) {
  await appendRunEvent(runId, "run.indexing", "Indexing uploaded reference images");
  const activeImages = await indexImages(runId);
  await setRunIndexed({
    runId,
    imageCount: activeImages.length,
    analysisTotal: activeImages.length * models.length,
  });
  await appendRunEvent(
    runId,
    "run.analyzing",
    `Analyzing ${activeImages.length} images with ${models.length} models`,
  );
  return activeImages;
}

async function executeRawAnalysisJob(job: WorkflowJob) {
  const payload = rawAnalysisPayload.parse(job.payload);
  await analyzeImageModel(job.runId, payload.imageId, payload.model);
  if (await rawAnalysisReady(job.runId, payload.imageId)) {
    await enqueueWorkflowJob({
      runId: job.runId,
      type: "synthesize_note",
      dedupeKey: workflowKey(job.runId, "synthesize_note", payload.imageId),
      payload: { imageId: payload.imageId },
    });
  }
}

async function executeSynthesizeNoteJob(job: WorkflowJob) {
  const payload = imagePayload.parse(job.payload);
  await synthesizeOneNote(job.runId, payload.imageId);
  const run = await requireRun(job.runId);
  if ((await synthesizedNoteCount(job.runId)) >= run.imageCount) {
    await claimStatus(job.runId, "synthesizing_notes", "extracting_rules", "Extracting visual rule chunks");
    await enqueueWorkflowJob({
      runId: job.runId,
      type: "prepare_rules",
      dedupeKey: workflowKey(job.runId, "prepare_rules"),
    });
  }
}

async function executePrepareRulesJob(runId: string) {
  const chunks = await prepareRuleChunks(runId);
  for (const chunk of chunks) {
    await enqueueWorkflowJob({
      runId,
      type: "rule_chunk",
      dedupeKey: workflowKey(runId, "rule_chunk", chunk.id),
      payload: { chunkId: chunk.id },
    });
  }
}

async function executeRuleChunkJob(job: WorkflowJob) {
  const payload = ruleChunkPayload.parse(job.payload);
  await extractRuleChunkForRun(job.runId, payload.chunkId);
  const run = await requireRun(job.runId);
  if ((await countArtifacts(job.runId, "rule_chunk")) >= run.ruleChunkTotal) {
    await enqueueWorkflowJob({
      runId: job.runId,
      type: "reduce_rules",
      dedupeKey: workflowKey(job.runId, "reduce_rules", "1"),
      payload: { level: 1, sourceType: "rule_chunk" },
    });
  }
}

async function executeReduceRulesJob(job: WorkflowJob) {
  const payload = reduceRulesPayload.parse(job.payload);
  const current = await ruleResultsForRun(job.runId, payload.sourceType, payload.sourceIds);
  if (current.length === 0) throw new Error("No rule results available to reduce");
  if (current.length <= env().RULE_MERGE_FAN_IN) {
    await enqueueWorkflowJob({
      runId: job.runId,
      type: "rule_set",
      dedupeKey: workflowKey(job.runId, "rule_set"),
      payload: {
        sourceType: payload.sourceType,
        sourceIds: current.map((result) => result.id),
      },
    });
    return;
  }

  const groups = chunkRuleResults(current, env().RULE_MERGE_FAN_IN);
  const expectedMergeIds = groups.map((_, index) => mergeId(payload.level, index));
  await appendRunEvent(
    job.runId,
    "rules.merge.layer",
    `Merging ${current.length} rule chunks into ${groups.length} intermediate chunks`,
    { level: payload.level, inputCount: current.length, outputCount: groups.length },
  );
  for (const [index, group] of groups.entries()) {
    const id = expectedMergeIds[index];
    if (!id) continue;
    await enqueueWorkflowJob({
      runId: job.runId,
      type: "rule_merge",
      dedupeKey: workflowKey(job.runId, "rule_merge", id),
      payload: {
        level: payload.level,
        mergeId: id,
        sourceType: payload.sourceType,
        sourceIds: group.map((result) => result.id),
        expectedMergeIds,
      },
    });
  }
}

async function executeRuleMergeJob(job: WorkflowJob) {
  const payload = ruleMergePayload.parse(job.payload);
  await synthesizeRuleMergeForRun({
    runId: job.runId,
    mergeId: payload.mergeId,
    sourceType: payload.sourceType,
    sourceIds: payload.sourceIds,
    level: payload.level,
  });
  const completed = await ruleResultsForRun(job.runId, "rule_merge", payload.expectedMergeIds);
  if (completed.length >= payload.expectedMergeIds.length) {
    await enqueueWorkflowJob({
      runId: job.runId,
      type: "reduce_rules",
      dedupeKey: workflowKey(job.runId, "reduce_rules", String(payload.level + 1)),
      payload: {
        level: payload.level + 1,
        sourceType: "rule_merge",
        sourceIds: payload.expectedMergeIds,
      },
    });
  }
}

async function executeRuleSetJob(job: WorkflowJob) {
  const payload = ruleSetPayload.parse(job.payload);
  await synthesizeRuleSetForRun({
    runId: job.runId,
    sourceType: payload.sourceType,
    sourceIds: payload.sourceIds,
  });
  await enqueueWorkflowJob({
    runId: job.runId,
    type: "skill",
    dedupeKey: workflowKey(job.runId, "skill"),
  });
}

async function executeSkillJob(runId: string) {
  const run = await requireRun(runId);
  await generateFinalSkill(runId, decryptRunCredentials(run));
}

function workflowKey(runId: string, ...parts: string[]): string {
  return [runId, ...parts].join(":");
}

function mergeId(level: number, index: number): string {
  return `merge_${String(level).padStart(2, "0")}_${String(index + 1).padStart(2, "0")}`;
}
