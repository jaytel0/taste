import {
  chunkRuleResults,
  chunkSynthesizedNotes,
  extractRuleChunk,
  generateSkill as generateSkillArtifact,
  modelSlug,
  synthesizeImageNote,
  synthesizeRuleSet,
  analyzeImage as runImageAnalysis,
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
  setRuleChunkTotal,
  setRawAnalysisCount,
  setRuleChunkCount,
  setSynthesizedNoteCount,
  setRunIndexed,
  storeArtifact,
  updateImageIndex,
  updateRunStatus,
} from "@/db/repository";
import { putTextArtifact, downloadBlobBytes } from "@/storage/blob";
import { dimensions, sha256 } from "@/storage/image";
import { inngest } from "./client";

const analyzeConcurrency = Number(process.env.ANALYZE_IMAGE_CONCURRENCY ?? "8");
const synthesizeConcurrency = Number(process.env.SYNTHESIZE_NOTE_CONCURRENCY ?? "8");
const ruleMergeFanIn = Number(process.env.RULE_MERGE_FAN_IN ?? "6");

export const startRun = inngest.createFunction(
  { id: "taste-start-run" },
  { event: "taste/run.started" },
  async ({ event, step }) => {
    const runId = event.data.runId as string;
    try {
      await step.run("mark indexing", async () => {
        await updateRunStatus(runId, "indexing", {
          currentStep: "Indexing uploaded reference images",
          progressPercent: 2,
        });
        await appendRunEvent(runId, "run.indexing", "Indexing uploaded reference images");
      });

      const activeImages = await step.run("index images", async () => {
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
      });

      await step.run("fan out analysis", async () => {
        const models = analysisModels();
        await setRunIndexed({
          runId,
          imageCount: activeImages.length,
          analysisTotal: activeImages.length * models.length,
        });
        await appendRunEvent(runId, "run.analyzing", `Analyzing ${activeImages.length} images with ${models.length} models`);
        await inngest.send(
          activeImages.map((image) => ({
            name: "taste/image.analysis.requested",
            data: { runId, imageId: image.imageId },
          })),
        );
      });
    } catch (error) {
      await step.run("fail run", async () => failRun(runId, error));
      throw error;
    }
  },
);

export const analyzeImage = inngest.createFunction(
  {
    id: "taste-analyze-image",
    concurrency: { limit: analyzeConcurrency, key: "event.data.runId" },
  },
  { event: "taste/image.analysis.requested" },
  async ({ event, step }) => {
    const runId = event.data.runId as string;
    const imageId = event.data.imageId as string;
    try {
      const analysisPayload = await step.run("run parallel model analyses", async () => {
        const run = await requireRun(runId);
        const image = await getImageByImageId(runId, imageId);
        const imageBytes = await downloadBlobBytes(image.downloadUrl ?? image.blobUrl);
        const token = decryptRunToken(run);
        const models = analysisModels();
        const results = await Promise.all(
          models.map(async (model) => ({
            model,
            result: await runImageAnalysis({
              aiGatewayToken: token,
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
        return {
          image: {
            imageId: image.imageId ?? imageId,
            pathname: image.pathname,
          },
          models,
          results,
        };
      });

      await step.run("store raw analyses", async () => {
        for (const { model, result } of analysisPayload.results) {
          const content = withFrontmatter(
            {
              imageId,
              image: analysisPayload.image.pathname,
              model,
              proxyProvider: providerFromModel(model),
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
            },
          });
        }
        await setRawAnalysisCount(runId, await countArtifacts(runId, "raw_analysis"));
        await appendRunEvent(runId, "image.analyzed", `Analyzed ${imageId}`, {
          imageId,
          models: analysisPayload.models,
        });
        await inngest.send({
          name: "taste/image.synthesis.requested",
          data: { runId, imageId },
        });
      });
    } catch (error) {
      await step.run("fail run", async () => failRun(runId, error));
      throw error;
    }
  },
);

export const synthesizeNote = inngest.createFunction(
  {
    id: "taste-synthesize-note",
    concurrency: { limit: synthesizeConcurrency, key: "event.data.runId" },
  },
  { event: "taste/image.synthesis.requested" },
  async ({ event, step }) => {
    const runId = event.data.runId as string;
    const imageId = event.data.imageId as string;
    try {
      const synthesisPayload = await step.run("generate synthesized image note", async () => {
        const run = await requireRun(runId);
        const image = await getImageByImageId(runId, imageId);
        const imageBytes = await downloadBlobBytes(image.downloadUrl ?? image.blobUrl);
        const rawAnalyses = (await listArtifacts(runId, "raw_analysis")).filter(
          (artifact) => artifact.imageId === imageId,
        );
        const expected = analysisModels().length;
        if (rawAnalyses.length < expected) {
          throw new Error(`Missing raw analyses for ${imageId}: ${rawAnalyses.length}/${expected}`);
        }
        const token = decryptRunToken(run);
        const result = await synthesizeImageNote({
          aiGatewayToken: token,
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
          analyses: rawAnalyses.map((artifact) => ({
            model: artifact.model ?? "unknown",
            text: artifact.content ?? "",
          })),
        });
        return {
          image: {
            pathname: image.pathname,
          },
          rawAnalysisModels: rawAnalyses.map((artifact) => artifact.model ?? "unknown"),
          result,
        };
      });

      await step.run("store synthesized note", async () => {
        const content = withFrontmatter(
          {
            imageId,
            image: synthesisPayload.image.pathname,
            sourceAnalyses: synthesisPayload.rawAnalysisModels,
            synthesisModel: env().SYNTHESIS_MODEL,
            createdAt: new Date().toISOString(),
          },
          synthesisPayload.result.text,
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
            usage: synthesisPayload.result.usage,
            responseModel: synthesisPayload.result.model,
          },
        });
        await setSynthesizedNoteCount(runId, await countArtifacts(runId, "synthesized_note"));
        await appendRunEvent(runId, "image.synthesized", `Synthesized ${imageId}`, { imageId });

        const runAfter = await requireRun(runId);
        const synthesizedCount = await countArtifacts(runId, "synthesized_note");
        if (synthesizedCount >= runAfter.imageCount) {
          const claimed = await claimStatus(
            runId,
            "synthesizing_notes",
            "extracting_rules",
            "Extracting visual rule chunks",
          );
          if (claimed) {
            await inngest.send({ name: "taste/rules.requested", data: { runId } });
          }
        }
      });
    } catch (error) {
      await step.run("fail run", async () => failRun(runId, error));
      throw error;
    }
  },
);

export const extractRules = inngest.createFunction(
  { id: "taste-extract-rules" },
  { event: "taste/rules.requested" },
  async ({ event, step }) => {
    const runId = event.data.runId as string;
    try {
      const { run, chunks } = await step.run("load notes and chunk", async () => {
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
        return { run, chunks };
      });

      const token = decryptRunToken(run);
      const chunkResults = await step.run("generate rule chunks in parallel", async () => {
        const results = await Promise.all(
          chunks.map(async (chunk) => {
            const result = await extractRuleChunk({
              aiGatewayToken: token,
              model: env().RULE_MODEL,
              chunk,
            });
            const content = result.text;
            const stored = await putTextArtifact(
              `runs/${runId}/03-rule-set/chunks/${chunk.id}-rules.md`,
              content,
            );
            await storeArtifact({
              runId,
              type: "rule_chunk",
              chunkId: chunk.id,
              model: env().RULE_MODEL,
              pathname: stored.pathname,
              blobUrl: stored.blobUrl,
              content,
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
              text: content,
            } satisfies RuleChunkResult;
          }),
        );
        return results.sort((a, b) => a.id.localeCompare(b.id));
      });

      await step.run("generate final rule set", async () => {
        const reducedRuleResults = await reduceRuleResults({
          runId,
          token,
          chunkResults,
        });
        const result = await synthesizeRuleSet({
          aiGatewayToken: token,
          model: env().RULE_MODEL,
          chunkResults: reducedRuleResults,
        });
        const stored = await putTextArtifact(`runs/${runId}/03-rule-set/rule-set.md`, result.text);
        await storeArtifact({
          runId,
          type: "rule_set",
          model: env().RULE_MODEL,
          pathname: stored.pathname,
          blobUrl: stored.blobUrl,
          content: result.text,
          bytes: stored.bytes,
          metadata: {
            usage: result.usage,
            responseModel: result.model,
          },
        });
        await updateRunStatus(runId, "generating_skill", {
          currentStep: "Generating final skill",
          progressPercent: 95,
        });
        await appendRunEvent(runId, "rules.complete", "Final rule set generated");
        await inngest.send({ name: "taste/skill.requested", data: { runId } });
      });
    } catch (error) {
      await step.run("fail run", async () => failRun(runId, error));
      throw error;
    }
  },
);

export const generateSkill = inngest.createFunction(
  { id: "taste-generate-skill" },
  { event: "taste/skill.requested" },
  async ({ event, step }) => {
    const runId = event.data.runId as string;
    try {
      const { run, ruleSet } = await step.run("load rule set", async () => {
        const run = await requireRun(runId);
        const ruleSet = await getArtifact({ runId, type: "rule_set" });
        if (!ruleSet?.content) throw new Error("Final rule set is missing");
        return { run, ruleSet };
      });

      const token = decryptRunToken(run);
      const result = await step.run("generate final skill", async () =>
        generateSkillArtifact({
          aiGatewayToken: token,
          model: env().SKILL_MODEL,
          ruleSet: ruleSet.content ?? "",
        }),
      );

      await step.run("store final skill and complete", async () => {
        const stored = await putTextArtifact(`runs/${runId}/04-skill/SKILL.md`, result.text);
        await storeArtifact({
          runId,
          type: "skill",
          model: env().SKILL_MODEL,
          pathname: stored.pathname,
          blobUrl: stored.blobUrl,
          content: result.text,
          bytes: stored.bytes,
          metadata: {
            usage: result.usage,
            responseModel: result.model,
          },
        });
        await updateRunStatus(runId, "complete", {
          currentStep: "Complete",
          progressPercent: 100,
          completedAt: new Date(),
        });
        await appendRunEvent(runId, "run.complete", "Final skill generated");
        await purgeRunToken(runId);
      });
    } catch (error) {
      await step.run("fail run", async () => failRun(runId, error));
      throw error;
    }
  },
);

export const functions = [
  startRun,
  analyzeImage,
  synthesizeNote,
  extractRules,
  generateSkill,
];

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
