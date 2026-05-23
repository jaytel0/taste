import {
  chunkRuleResults,
  chunkSynthesizedNotes,
  extractRuleChunk,
  generateSkill as generateSkillArtifact,
  synthesizeRuleSet,
  type RuleChunkResult,
} from "@taste/ai";

import { env } from "@/config";
import {
  appendRunEvent,
  countArtifacts,
  decryptRunCredentials,
  getArtifact,
  listArtifacts,
  purgeRunCredentials,
  requireRun,
  setRuleChunkCount,
  setRuleChunkTotal,
  storeArtifact,
  throwIfRunCanceled,
  updateRunStatus,
} from "@/db/repository";
import { putTextArtifact } from "@/storage/blob";
import { createRunAbortWatcher } from "./utils";

const ruleMergeFanIn = Number(process.env.RULE_MERGE_FAN_IN ?? "6");

export async function prepareRuleChunks(runId: string) {
  await throwIfRunCanceled(runId);
  const notes = (await listArtifacts(runId, "synthesized_note")).map((artifact) => ({
    imageId: artifact.imageId ?? "",
    file: `${artifact.imageId}.md`,
    text: artifact.content ?? "",
  }));
  const chunks = chunkSynthesizedNotes(notes, env().RULE_CHUNK_SIZE);
  await setRuleChunkTotal(runId, chunks.length);
  await appendRunEvent(
    runId,
    "rules.chunking",
    `Extracting ${chunks.length} rule chunks with max merge fan-in ${ruleMergeFanIn}`,
  );
  return chunks;
}

export async function extractRuleChunkForRun(runId: string, chunkId: string) {
  await throwIfRunCanceled(runId);
  const existing = await getArtifact({ runId, type: "rule_chunk", chunkId });
  if (existing) {
    await setRuleChunkCount(runId, await countArtifacts(runId, "rule_chunk"));
    return;
  }
  const run = await requireRun(runId);
  const chunk = (await prepareRuleChunksForRead(runId)).find((item) => item.id === chunkId);
  if (!chunk) throw new Error(`Rule chunk not found: ${chunkId}`);
  const abort = createRunAbortWatcher(runId);
  const result = await extractRuleChunk({
    credentials: decryptRunCredentials(run),
    model: env().RULE_MODEL,
    chunk,
    abortSignal: abort.signal,
  }).finally(() => abort.dispose());
  await throwIfRunCanceled(runId);
  const stored = await putTextArtifact(
    `runs/${runId}/03-rule-set/chunks/${chunk.id}-rules.md`,
    result.text,
  );
  await storeArtifact({
    runId,
    type: "rule_chunk",
    chunkId: chunk.id,
    model: env().RULE_MODEL,
    pathname: stored.pathname,
    blobUrl: stored.blobUrl,
    content: result.text,
    bytes: stored.bytes,
    metadata: {
      usage: result.usage,
      responseModel: result.model,
      files: chunk.notes.map((note) => note.file),
    },
  });
  await setRuleChunkCount(runId, await countArtifacts(runId, "rule_chunk"));
  await appendRunEvent(runId, "rules.chunk.complete", `Completed ${chunk.id}`, {
    chunkId: chunk.id,
  });
}

export async function ruleResultsForRun(
  runId: string,
  type: "rule_chunk" | "rule_merge",
  sourceIds?: string[] | undefined,
): Promise<RuleChunkResult[]> {
  const sourceSet = sourceIds ? new Set(sourceIds) : null;
  return (await listArtifacts(runId, type))
    .filter((artifact) => artifact.chunkId && (!sourceSet || sourceSet.has(artifact.chunkId)))
    .map((artifact) => ({
      id: artifact.chunkId ?? "",
      files: sourceFiles(artifact.metadata, artifact.chunkId ?? ""),
      text: artifact.content ?? "",
    }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export async function synthesizeRuleMergeForRun(input: {
  runId: string;
  mergeId: string;
  sourceType: "rule_chunk" | "rule_merge";
  sourceIds: string[];
  level: number;
}) {
  await throwIfRunCanceled(input.runId);
  const existing = await getArtifact({ runId: input.runId, type: "rule_merge", chunkId: input.mergeId });
  if (existing) return;
  const run = await requireRun(input.runId);
  const group = await ruleResultsForRun(input.runId, input.sourceType, input.sourceIds);
  if (group.length !== input.sourceIds.length) {
    throw new Error(`Rule merge ${input.mergeId} missing inputs: ${group.length}/${input.sourceIds.length}`);
  }
  const abort = createRunAbortWatcher(input.runId);
  const result = await synthesizeRuleSet({
    credentials: decryptRunCredentials(run),
    model: env().RULE_MODEL,
    chunkResults: group,
    abortSignal: abort.signal,
  }).finally(() => abort.dispose());
  await throwIfRunCanceled(input.runId);
  const stored = await putTextArtifact(
    `runs/${input.runId}/03-rule-set/merges/${input.mergeId}-rules.md`,
    result.text,
  );
  await storeArtifact({
    runId: input.runId,
    type: "rule_merge",
    chunkId: input.mergeId,
    model: env().RULE_MODEL,
    pathname: stored.pathname,
    blobUrl: stored.blobUrl,
    content: result.text,
    bytes: stored.bytes,
    metadata: {
      usage: result.usage,
      responseModel: result.model,
      sourceChunks: group.map((chunk) => chunk.id),
    },
  });
  await appendRunEvent(input.runId, "rules.merge.complete", `Completed ${input.mergeId}`, {
    level: input.level,
    chunkId: input.mergeId,
  });
}

export async function synthesizeRuleSetForRun(input: {
  runId: string;
  sourceType: "rule_chunk" | "rule_merge";
  sourceIds: string[];
}) {
  await throwIfRunCanceled(input.runId);
  const existing = await getArtifact({ runId: input.runId, type: "rule_set" });
  if (existing) return;
  const run = await requireRun(input.runId);
  const chunkResults = await ruleResultsForRun(input.runId, input.sourceType, input.sourceIds);
  if (chunkResults.length !== input.sourceIds.length) {
    throw new Error(`Final rule set missing inputs: ${chunkResults.length}/${input.sourceIds.length}`);
  }
  const abort = createRunAbortWatcher(input.runId);
  const ruleSet = await synthesizeRuleSet({
    credentials: decryptRunCredentials(run),
    model: env().RULE_MODEL,
    chunkResults,
    abortSignal: abort.signal,
  }).finally(() => abort.dispose());
  await throwIfRunCanceled(input.runId);
  const ruleStored = await putTextArtifact(`runs/${input.runId}/03-rule-set/rule-set.md`, ruleSet.text);
  await storeArtifact({
    runId: input.runId,
    type: "rule_set",
    model: env().RULE_MODEL,
    pathname: ruleStored.pathname,
    blobUrl: ruleStored.blobUrl,
    content: ruleSet.text,
    bytes: ruleStored.bytes,
    metadata: {
      usage: ruleSet.usage,
      responseModel: ruleSet.model,
    },
  });
  await updateRunStatus(input.runId, "generating_skill", {
    currentStep: "Generating final skill",
    progressPercent: 95,
  });
  await appendRunEvent(input.runId, "rules.complete", "Final rule set generated");
}

export async function extractRulesAndSkill(runId: string) {
  await throwIfRunCanceled(runId);
  const run = await requireRun(runId);
  const notes = (await listArtifacts(runId, "synthesized_note")).map((artifact) => ({
    imageId: artifact.imageId ?? "",
    file: `${artifact.imageId}.md`,
    text: artifact.content ?? "",
  }));
  const chunks = chunkSynthesizedNotes(notes, env().RULE_CHUNK_SIZE);
  await setRuleChunkTotal(runId, chunks.length);
  await appendRunEvent(
    runId,
    "rules.chunking",
    `Extracting ${chunks.length} rule chunks with max merge fan-in ${ruleMergeFanIn}`,
  );
  const credentials = decryptRunCredentials(run);

  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      await throwIfRunCanceled(runId);
      const abort = createRunAbortWatcher(runId);
      const result = await extractRuleChunk({
        credentials,
        model: env().RULE_MODEL,
        chunk,
        abortSignal: abort.signal,
      }).finally(() => abort.dispose());
      await throwIfRunCanceled(runId);
      const stored = await putTextArtifact(
        `runs/${runId}/03-rule-set/chunks/${chunk.id}-rules.md`,
        result.text,
      );
      await storeArtifact({
        runId,
        type: "rule_chunk",
        chunkId: chunk.id,
        model: env().RULE_MODEL,
        pathname: stored.pathname,
        blobUrl: stored.blobUrl,
        content: result.text,
        bytes: stored.bytes,
        metadata: {
          usage: result.usage,
          responseModel: result.model,
          files: chunk.notes.map((note) => note.file),
        },
      });
      await setRuleChunkCount(runId, await countArtifacts(runId, "rule_chunk"));
      await appendRunEvent(runId, "rules.chunk.complete", `Completed ${chunk.id}`, {
        chunkId: chunk.id,
      });
      return {
        id: chunk.id,
        files: chunk.notes.map((note) => note.file),
        text: result.text,
      } satisfies RuleChunkResult;
    }),
  );

  const reducedRuleResults = await reduceRuleResults({
    runId,
    credentials,
    chunkResults: chunkResults.sort((a, b) => a.id.localeCompare(b.id)),
  });

  await throwIfRunCanceled(runId);
  const ruleAbort = createRunAbortWatcher(runId);
  const ruleSet = await synthesizeRuleSet({
    credentials,
    model: env().RULE_MODEL,
    chunkResults: reducedRuleResults,
    abortSignal: ruleAbort.signal,
  }).finally(() => ruleAbort.dispose());
  await throwIfRunCanceled(runId);
  const ruleStored = await putTextArtifact(`runs/${runId}/03-rule-set/rule-set.md`, ruleSet.text);
  await storeArtifact({
    runId,
    type: "rule_set",
    model: env().RULE_MODEL,
    pathname: ruleStored.pathname,
    blobUrl: ruleStored.blobUrl,
    content: ruleSet.text,
    bytes: ruleStored.bytes,
    metadata: {
      usage: ruleSet.usage,
      responseModel: ruleSet.model,
    },
  });
  await updateRunStatus(runId, "generating_skill", {
    currentStep: "Generating final skill",
    progressPercent: 95,
  });
  await appendRunEvent(runId, "rules.complete", "Final rule set generated");

  await generateFinalSkill(runId, credentials);
}

async function prepareRuleChunksForRead(runId: string) {
  const notes = (await listArtifacts(runId, "synthesized_note")).map((artifact) => ({
    imageId: artifact.imageId ?? "",
    file: `${artifact.imageId}.md`,
    text: artifact.content ?? "",
  }));
  return chunkSynthesizedNotes(notes, env().RULE_CHUNK_SIZE);
}

function sourceFiles(metadata: Record<string, unknown>, fallback: string): string[] {
  const files = metadata.files;
  if (Array.isArray(files) && files.every((file) => typeof file === "string")) return files;
  const sourceChunks = metadata.sourceChunks;
  if (Array.isArray(sourceChunks) && sourceChunks.every((file) => typeof file === "string")) {
    return sourceChunks;
  }
  return [fallback];
}

export async function generateFinalSkill(
  runId: string,
  credentials: Parameters<typeof generateSkillArtifact>[0]["credentials"],
) {
  await throwIfRunCanceled(runId);
  const latestRuleSet = await getArtifact({ runId, type: "rule_set" });
  if (!latestRuleSet?.content) throw new Error("Final rule set is missing");
  const abort = createRunAbortWatcher(runId);
  const skill = await generateSkillArtifact({
    credentials,
    model: env().SKILL_MODEL,
    ruleSet: latestRuleSet.content,
    abortSignal: abort.signal,
  }).finally(() => abort.dispose());
  await throwIfRunCanceled(runId);
  const skillStored = await putTextArtifact(`runs/${runId}/04-skill/SKILL.md`, skill.text);
  await storeArtifact({
    runId,
    type: "skill",
    model: env().SKILL_MODEL,
    pathname: skillStored.pathname,
    blobUrl: skillStored.blobUrl,
    content: skill.text,
    bytes: skillStored.bytes,
    metadata: {
      usage: skill.usage,
      responseModel: skill.model,
    },
  });
  await updateRunStatus(runId, "complete", {
    currentStep: "Complete",
    progressPercent: 100,
    completedAt: new Date(),
  });
  await appendRunEvent(runId, "run.complete", "Final skill generated");
  await purgeRunCredentials(runId);
}

async function reduceRuleResults(input: {
  runId: string;
  credentials: Parameters<typeof synthesizeRuleSet>[0]["credentials"];
  chunkResults: RuleChunkResult[];
}): Promise<RuleChunkResult[]> {
  let current = input.chunkResults;
  let level = 1;
  while (current.length > ruleMergeFanIn) {
    const groups = chunkRuleResults(current, ruleMergeFanIn);
    await appendRunEvent(
      input.runId,
      "rules.merge.layer",
      `Merging ${current.length} rule chunks into ${groups.length} intermediate chunks`,
      { level, inputCount: current.length, outputCount: groups.length },
    );
    current = await Promise.all(
      groups.map(async (group, index) => {
        await throwIfRunCanceled(input.runId);
        const id = `merge_${String(level).padStart(2, "0")}_${String(index + 1).padStart(2, "0")}`;
        const abort = createRunAbortWatcher(input.runId);
        const result = await synthesizeRuleSet({
          credentials: input.credentials,
          model: env().RULE_MODEL,
          chunkResults: group,
          abortSignal: abort.signal,
        }).finally(() => abort.dispose());
        await throwIfRunCanceled(input.runId);
        const stored = await putTextArtifact(
          `runs/${input.runId}/03-rule-set/merges/${id}-rules.md`,
          result.text,
        );
        await storeArtifact({
          runId: input.runId,
          type: "rule_merge",
          chunkId: id,
          model: env().RULE_MODEL,
          pathname: stored.pathname,
          blobUrl: stored.blobUrl,
          content: result.text,
          bytes: stored.bytes,
          metadata: {
            usage: result.usage,
            responseModel: result.model,
            sourceChunks: group.map((chunk) => chunk.id),
          },
        });
        await appendRunEvent(input.runId, "rules.merge.complete", `Completed ${id}`, {
          level,
          chunkId: id,
        });
        return {
          id,
          files: group.flatMap((chunk) => chunk.files),
          text: result.text,
        } satisfies RuleChunkResult;
      }),
    );
    level += 1;
  }
  return current.sort((a, b) => a.id.localeCompare(b.id));
}
