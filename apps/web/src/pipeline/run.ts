import {
  analyzeImage as runImageAnalysis,
  chunkRuleResults,
  chunkSynthesizedNotes,
  extractRuleChunk,
  generateSkill as generateSkillArtifact,
  modelSlug,
  synthesizeImageNote,
  synthesizeRuleSet,
  type RuleChunkResult,
} from "@taste/ai";

import { analysisModels, env } from "@/config";
import {
  appendRunEvent,
  claimStatus,
  countArtifacts,
  decryptRunToken,
  failRun,
  getArtifact,
  getImageByImageId,
  listActiveImages,
  listArtifacts,
  listImages,
  purgeRunToken,
  requireRun,
  setRawAnalysisCount,
  setRuleChunkCount,
  setRuleChunkTotal,
  setRunIndexed,
  setSynthesizedNoteCount,
  storeArtifact,
  updateImageIndex,
  updateRunStatus,
} from "@/db/repository";
import { downloadBlobBytes, putTextArtifact } from "@/storage/blob";
import { dimensions, sha256 } from "@/storage/image";

const analyzeConcurrency = Number(process.env.ANALYZE_IMAGE_CONCURRENCY ?? "8");
const synthesizeConcurrency = Number(process.env.SYNTHESIZE_NOTE_CONCURRENCY ?? "8");
const ruleMergeFanIn = Number(process.env.RULE_MERGE_FAN_IN ?? "6");

export async function processRun(runId: string) {
  try {
    const initialRun = await requireRun(runId);
    if (initialRun.status === "complete" || initialRun.status === "canceled") return;
    if (initialRun.status === "uploading") {
      throw new Error("Run has not been queued");
    }
    if (initialRun.status === "generating_skill") {
      await generateFinalSkill(runId, decryptRunToken(initialRun) || undefined);
      return;
    }
    if (initialRun.status === "extracting_rules") {
      await extractRulesAndSkill(runId);
      return;
    }

    await updateRunStatus(runId, "indexing", {
      currentStep: "Indexing uploaded reference images",
      progressPercent: 2,
    });
    await appendRunEvent(runId, "run.indexing", "Indexing uploaded reference images");

    const activeImages = await indexImages(runId);
    const models = analysisModels();
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

    const synthLimiter = new AdaptiveLimiter(synthesizeConcurrency);
    const synthesisJobs: Promise<void>[] = [];
    await mapConcurrent(activeImages, analyzeConcurrency, async (image) => {
      if (!image.imageId) return;
      await analyzeOneImage(runId, image.imageId);
      synthesisJobs.push(
        synthLimiter.run(() => synthesizeOneNote(runId, image.imageId ?? "")),
      );
    });
    await Promise.all(synthesisJobs);

    const claimed = await claimStatus(
      runId,
      "synthesizing_notes",
      "extracting_rules",
      "Extracting visual rule chunks",
    );
    if (!claimed) {
      const run = await requireRun(runId);
      if (run.status !== "extracting_rules") return;
    }
    await extractRulesAndSkill(runId);
  } catch (error) {
    await failRun(runId, error);
    throw error;
  }
}

async function indexImages(runId: string) {
  const uploaded = await listImages(runId);
  if (uploaded.length === 0) throw new Error("No uploaded images found");
  const seen = new Map<string, string>();
  let activeIndex = 0;

  for (const image of uploaded) {
    const bytes = await downloadBlobBytes(image.downloadUrl ?? image.blobUrl);
    const digest = sha256(bytes);
    const size = dimensions(bytes);
    const duplicateOfImageId = seen.get(digest) ?? null;
    const imageId = duplicateOfImageId
      ? null
      : `img_${String(++activeIndex).padStart(4, "0")}`;
    if (imageId) seen.set(digest, imageId);
    await updateImageIndex({
      rowId: image.id,
      imageId,
      sha256: digest,
      width: size.width,
      height: size.height,
      isDuplicate: Boolean(duplicateOfImageId),
      duplicateOfImageId,
    });
  }

  const active = await listActiveImages(runId);
  const rows = active.map((image) =>
    JSON.stringify({
      id: image.imageId,
      path: image.pathname,
      basename: image.basename,
      sha256: image.sha256,
      bytes: image.bytes,
      width: image.width,
      height: image.height,
      createdAt: image.createdAt.toISOString(),
    }),
  );
  const content = `${rows.join("\n")}${rows.length ? "\n" : ""}`;
  const stored = await putTextArtifact(`runs/${runId}/01-corpus/images.jsonl`, content);
  await storeArtifact({
    runId,
    type: "corpus_index",
    pathname: stored.pathname,
    blobUrl: stored.blobUrl,
    content,
    bytes: stored.bytes,
  });
  return active;
}

async function analyzeOneImage(runId: string, imageId: string) {
  const run = await requireRun(runId);
  const image = await getImageByImageId(runId, imageId);
  const imageBytes = await downloadBlobBytes(image.downloadUrl ?? image.blobUrl);
  const token = decryptRunToken(run);
  const models = analysisModels();
  const existing = (await listArtifacts(runId, "raw_analysis")).filter(
    (artifact) => artifact.imageId === imageId,
  );
  const existingModels = new Set(existing.map((artifact) => artifact.model));
  const missingModels = models.filter((model) => !existingModels.has(model));
  if (missingModels.length === 0) {
    await setRawAnalysisCount(runId, await countArtifacts(runId, "raw_analysis"));
    return;
  }

  const results = await Promise.allSettled(
    missingModels.map(async (model) => ({
      model,
      result: await runImageAnalysis({
        aiGatewayToken: token || undefined,
        model,
        image: {
          id: image.imageId ?? imageId,
          basename: image.basename,
          width: image.width,
          height: image.height,
          bytes: image.bytes,
        },
        imageInput: {
          bytes: imageBytes,
          mediaType: image.contentType,
        },
      }),
    })),
  );

  for (const [index, resultItem] of results.entries()) {
    const model =
      resultItem.status === "fulfilled"
        ? resultItem.value.model
        : missingModels[index] ?? "unknown";
    const result =
      resultItem.status === "fulfilled"
        ? resultItem.value.result
        : softFailedGenerationResult(
            `Raw analysis failed after retries for ${imageId} with ${model}.`,
            resultItem.reason,
          );
    const content = withFrontmatter(
      {
        imageId,
        image: image.pathname,
        model,
        proxyProvider: providerFromModel(model),
        softFailed: resultItem.status === "rejected",
        createdAt: new Date().toISOString(),
      },
      result.text,
    );
    const stored = await putTextArtifact(
      `runs/${runId}/02-image-notes/raw/${imageId}/${modelSlug(model)}.md`,
      content,
    );
    await storeArtifact({
      runId,
      type: "raw_analysis",
      imageId,
      model,
      pathname: stored.pathname,
      blobUrl: stored.blobUrl,
      content,
      bytes: stored.bytes,
      metadata: {
        usage: result.usage,
        responseModel: result.model,
        softFailed: resultItem.status === "rejected",
        error: resultItem.status === "rejected" ? errorMessage(resultItem.reason) : undefined,
      },
    });
    if (resultItem.status === "rejected") {
      await appendRunEvent(runId, "image.analysis.soft_failed", `Soft-failed ${imageId} ${model}`, {
        imageId,
        model,
        error: errorMessage(resultItem.reason),
      });
    }
  }
  await setRawAnalysisCount(runId, await countArtifacts(runId, "raw_analysis"));
  await appendRunEvent(runId, "image.analyzed", `Analyzed ${imageId}`, {
    imageId,
    models,
  });
}

async function synthesizeOneNote(runId: string, imageId: string) {
  const run = await requireRun(runId);
  const image = await getImageByImageId(runId, imageId);
  const imageBytes = await downloadBlobBytes(image.downloadUrl ?? image.blobUrl);
  const existing = await getArtifact({ runId, type: "synthesized_note", imageId });
  if (existing) {
    await setSynthesizedNoteCount(runId, await countArtifacts(runId, "synthesized_note"));
    return;
  }
  const rawAnalyses = (await listArtifacts(runId, "raw_analysis")).filter(
    (artifact) => artifact.imageId === imageId,
  );
  const expected = analysisModels().length;
  if (rawAnalyses.length < expected) {
    throw new Error(`Missing raw analyses for ${imageId}: ${rawAnalyses.length}/${expected}`);
  }
  const analyses = rawAnalyses.map((artifact) => ({
    model: artifact.model ?? "unknown",
    text: artifact.content ?? "",
  }));
  let softFailed = false;
  let result;
  try {
    result = await synthesizeImageNote({
      aiGatewayToken: decryptRunToken(run) || undefined,
      model: env().SYNTHESIS_MODEL,
      image: {
        id: image.imageId ?? imageId,
        basename: image.basename,
        width: image.width,
        height: image.height,
        bytes: image.bytes,
      },
      imageInput: {
        bytes: imageBytes,
        mediaType: image.contentType,
      },
      analyses,
    });
  } catch (error) {
    softFailed = true;
    result = softFailedGenerationResult(
      `Image synthesis failed after retries for ${imageId}. Preserve the run by carrying raw evidence forward.`,
      error,
      analyses.map((analysis) => analysis.text).join("\n\n---\n\n"),
    );
    await appendRunEvent(runId, "image.synthesis.soft_failed", `Soft-failed synthesis for ${imageId}`, {
      imageId,
      error: errorMessage(error),
    });
  }

  const content = withFrontmatter(
    {
      imageId,
      image: image.pathname,
      sourceAnalyses: rawAnalyses.map((artifact) => artifact.model ?? "unknown"),
      synthesisModel: env().SYNTHESIS_MODEL,
      softFailed,
      createdAt: new Date().toISOString(),
    },
    result.text,
  );
  const stored = await putTextArtifact(
    `runs/${runId}/02-image-notes/synthesized/${imageId}.md`,
    content,
  );
  await storeArtifact({
    runId,
    type: "synthesized_note",
    imageId,
    model: env().SYNTHESIS_MODEL,
    pathname: stored.pathname,
    blobUrl: stored.blobUrl,
    content,
    bytes: stored.bytes,
    metadata: {
      usage: result.usage,
      responseModel: result.model,
      softFailed,
    },
  });
  await setSynthesizedNoteCount(runId, await countArtifacts(runId, "synthesized_note"));
  await appendRunEvent(runId, "image.synthesized", `Synthesized ${imageId}`, { imageId });
}

async function extractRulesAndSkill(runId: string) {
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
  const token = decryptRunToken(run) || undefined;

  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const result = await extractRuleChunk({
        aiGatewayToken: token,
        model: env().RULE_MODEL,
        chunk,
      });
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
    token,
    chunkResults: chunkResults.sort((a, b) => a.id.localeCompare(b.id)),
  });

  const ruleSet = await synthesizeRuleSet({
    aiGatewayToken: token,
    model: env().RULE_MODEL,
    chunkResults: reducedRuleResults,
  });
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

  await generateFinalSkill(runId, token);
}

async function reduceRuleResults(input: {
  runId: string;
  token: string | undefined;
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
        const id = `merge_${String(level).padStart(2, "0")}_${String(index + 1).padStart(2, "0")}`;
        const result = await synthesizeRuleSet({
          aiGatewayToken: input.token,
          model: env().RULE_MODEL,
          chunkResults: group,
        });
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

async function generateFinalSkill(runId: string, aiGatewayToken?: string | undefined) {
  const latestRuleSet = await getArtifact({ runId, type: "rule_set" });
  if (!latestRuleSet?.content) throw new Error("Final rule set is missing");
  const skill = await generateSkillArtifact({
    aiGatewayToken,
    model: env().SKILL_MODEL,
    ruleSet: latestRuleSet.content,
  });
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
  await purgeRunToken(runId);
}

async function mapConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  const limit = Math.max(1, Math.min(items.length, concurrency));
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        const item = items[index];
        if (item !== undefined) await worker(item);
      }
    }),
  );
}

class AdaptiveLimiter {
  private active = 0;
  private limit: number;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly maxLimit: number) {
    this.limit = Math.max(1, maxLimit);
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      const result = await operation();
      this.limit = Math.min(this.maxLimit, this.limit + 1);
      return result;
    } catch (error) {
      if (isThrottleLike(error)) {
        this.limit = Math.max(1, Math.floor(this.limit / 2));
      }
      throw error;
    } finally {
      this.active -= 1;
      this.drain();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private drain() {
    while (this.active < this.limit && this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    }
  }
}

function isThrottleLike(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const status = record.statusCode ?? record.status;
  return status === 429 || (typeof status === "number" && status >= 500);
}

function softFailedGenerationResult(message: string, error: unknown, evidence = "") {
  const errorText = errorMessage(error);
  return {
    text: [
      message,
      "",
      "This is a soft-failure artifact. The pipeline should continue, but downstream synthesis should treat this as lower-confidence evidence and prefer successful model outputs.",
      "",
      `Error: ${errorText}`,
      evidence ? `\nRaw evidence:\n${evidence.slice(0, 12_000)}` : "",
    ].join("\n").trim(),
    model: "soft-failure",
    usage: {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function providerFromModel(model: string): string {
  if (model.startsWith("anthropic/")) return "anthropic";
  if (model.startsWith("openai/")) return "openai";
  return model.split("/")[0] ?? "gateway";
}

function withFrontmatter(metadata: Record<string, unknown>, body: string): string {
  return [
    "---",
    ...Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    "---",
    "",
    body.trim(),
    "",
  ].join("\n");
}
