#!/usr/bin/env node

import {
  analyzeImage,
  chunkRuleResults,
  chunkSynthesizedNotes,
  DEFAULT_ANALYSIS_MODELS,
  DEFAULT_RULE_MODEL,
  DEFAULT_SKILL_MODEL,
  DEFAULT_SYNTHESIS_MODEL,
  extractRuleChunk,
  generateSkill,
  modelSlug,
  synthesizeImageNote,
  synthesizeRuleSet,
  type AiProviderCredentials,
  type RuleChunkResult,
  type TasteImage,
} from "@taste/ai";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Args = {
  imageDir: string;
  outDir?: string | undefined;
  provider?:
    | "direct"
    | "openrouter"
    | "gateway"
    | "vercel-gateway"
    | "openai"
    | "anthropic"
    | undefined;
  skillName?: string | undefined;
  analysisModels?: string[] | undefined;
  synthesisModel?: string | undefined;
  ruleModel?: string | undefined;
  skillModel?: string | undefined;
  ruleChunkSize: number;
  ruleMergeFanIn: number;
  maxImages: number;
};

type LocalProvider = NonNullable<Args["provider"]>;

type LocalImage = TasteImage & {
  absolutePath: string;
  relativePath: string;
  mediaType: string;
  sha256: string;
};

type LocalModels = {
  analysisModels: string[];
  synthesisModel: string;
  ruleModel: string;
  skillModel: string;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  loadDotEnv(path.join(repoRoot, ".env.local"));
  loadDotEnv(path.join(repoRoot, ".env"));

  const args = parseArgs(process.argv.slice(2));
  const credentials = resolveCredentials(args.provider);
  const models = resolveModels(credentials.mode, args);
  validateModelCompatibility(credentials, models);
  const runId = `local-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const outDir = path.resolve(repoRoot, args.outDir ?? path.join(".taste", "runs", runId));

  await mkdir(outDir, { recursive: true });
  log(`Writing local run to ${displayPath(outDir)}`);
  log(`Using ${providerLabel(credentials)} with ${models.analysisModels.join(", ")}`);

  const images = await indexImages(args.imageDir, args.maxImages, outDir);
  if (images.length === 0) {
    throw new Error(`No JPG, PNG, or WebP images found in ${args.imageDir}.`);
  }

  const synthesizedNotes = [];
  for (const image of images) {
    log(`Analyzing ${image.id} ${image.basename}`);
    const bytes = await readFile(image.absolutePath);
    const rawResults = [];
    for (const model of models.analysisModels) {
      const result = await analyzeImage({
        credentials,
        model,
        image,
        imageInput: { bytes, mediaType: image.mediaType },
      });
      rawResults.push({ model, text: result.text });
      await writeArtifact(
        outDir,
        `02-image-notes/raw/${image.id}/${modelSlug(model)}.md`,
        withFrontmatter(
          {
            imageId: image.id,
            image: image.relativePath,
            model,
            createdAt: new Date().toISOString(),
          },
          result.text,
        ),
      );
    }

    log(`Synthesizing ${image.id}`);
    const synthesized = await synthesizeImageNote({
      credentials,
      model: models.synthesisModel,
      image,
      imageInput: { bytes, mediaType: image.mediaType },
      analyses: rawResults,
    });
    const notePath = `02-image-notes/synthesized/${image.id}.md`;
    await writeArtifact(outDir, notePath, synthesized.text);
    synthesizedNotes.push({
      imageId: image.id,
      file: `${image.id}.md`,
      text: synthesized.text,
    });
  }

  const chunks = chunkSynthesizedNotes(synthesizedNotes, args.ruleChunkSize);
  log(`Extracting ${chunks.length} rule ${chunks.length === 1 ? "chunk" : "chunks"}`);
  const chunkResults: RuleChunkResult[] = [];
  for (const chunk of chunks) {
    const result = await extractRuleChunk({
      credentials,
      model: models.ruleModel,
      chunk,
    });
    await writeArtifact(outDir, `03-rule-set/chunks/${chunk.id}-rules.md`, result.text);
    chunkResults.push({
      id: chunk.id,
      files: chunk.notes.map((note) => note.file),
      text: result.text,
    });
  }

  const reduced = await reduceRuleResults({
    credentials,
    model: models.ruleModel,
    results: chunkResults,
    fanIn: args.ruleMergeFanIn,
    outDir,
  });

  log("Writing final rule set");
  const ruleSet = await synthesizeRuleSet({
    credentials,
    model: models.ruleModel,
    chunkResults: reduced,
  });
  await writeArtifact(outDir, "03-rule-set/rule-set.md", ruleSet.text);

  log("Writing SKILL.md");
  const skill = await generateSkill({
    credentials,
    model: models.skillModel,
    ruleSet: ruleSet.text,
    skillName: args.skillName,
  });
  await writeArtifact(outDir, "04-skill/SKILL.md", skill.text);
  await writeFile(path.join(outDir, "SKILL.md"), skill.text, "utf8");
  log(`Done: ${displayPath(path.join(outDir, "SKILL.md"))}`);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    imageDir: "reference-images",
    ruleChunkSize: numberFromEnv("RULE_CHUNK_SIZE", 10),
    ruleMergeFanIn: numberFromEnv("RULE_MERGE_FAN_IN", 6),
    maxImages: numberFromEnv("MAX_IMAGES_PER_RUN", 100),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--out") {
      args.outDir = requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--provider") {
      args.provider = parseProvider(requireValue(argv, ++index, arg));
      continue;
    }
    if (arg === "--skill-name") {
      args.skillName = requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--model") {
      const model = requireValue(argv, ++index, arg);
      args.analysisModels = [model];
      args.synthesisModel = model;
      args.ruleModel = model;
      args.skillModel = model;
      continue;
    }
    if (arg === "--analysis-models") {
      args.analysisModels = requireValue(argv, ++index, arg)
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean);
      continue;
    }
    if (arg === "--synthesis-model") {
      args.synthesisModel = requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--rule-model") {
      args.ruleModel = requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--skill-model") {
      args.skillModel = requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--rule-chunk-size") {
      args.ruleChunkSize = positiveInteger(requireValue(argv, ++index, arg), arg);
      continue;
    }
    if (arg === "--rule-merge-fan-in") {
      args.ruleMergeFanIn = positiveInteger(requireValue(argv, ++index, arg), arg);
      continue;
    }
    if (arg === "--max-images") {
      args.maxImages = positiveInteger(requireValue(argv, ++index, arg), arg);
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    args.imageDir = arg;
  }

  return args;
}

function resolveCredentials(provider: Args["provider"]): AiProviderCredentials {
  if (provider) {
    return credentialsForExplicitProvider(provider);
  }

  if (process.env.OPENAI_API_KEY && process.env.ANTHROPIC_API_KEY) {
    return {
      mode: "direct",
      openaiApiKey: process.env.OPENAI_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return { mode: "openrouter", openrouterApiKey: process.env.OPENROUTER_API_KEY };
  }
  if (process.env.AI_GATEWAY_API_KEY) {
    return { mode: "vercel_gateway", aiGatewayApiKey: process.env.AI_GATEWAY_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    return { mode: "openai", openaiApiKey: process.env.OPENAI_API_KEY };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { mode: "anthropic", anthropicApiKey: process.env.ANTHROPIC_API_KEY };
  }

  throw new Error(
    "Set OPENAI_API_KEY and ANTHROPIC_API_KEY, or set one gateway key: OPENROUTER_API_KEY or AI_GATEWAY_API_KEY.",
  );
}

function credentialsForExplicitProvider(provider: LocalProvider): AiProviderCredentials {
  if (provider === "direct") {
    return {
      mode: "direct",
      openaiApiKey: requiredEnv("OPENAI_API_KEY"),
      anthropicApiKey: requiredEnv("ANTHROPIC_API_KEY"),
    };
  }
  if (provider === "openrouter") {
    return { mode: "openrouter", openrouterApiKey: requiredEnv("OPENROUTER_API_KEY") };
  }
  if (provider === "gateway" || provider === "vercel-gateway") {
    return { mode: "vercel_gateway", aiGatewayApiKey: requiredEnv("AI_GATEWAY_API_KEY") };
  }
  if (provider === "openai") {
    return { mode: "openai", openaiApiKey: requiredEnv("OPENAI_API_KEY") };
  }
  return { mode: "anthropic", anthropicApiKey: requiredEnv("ANTHROPIC_API_KEY") };
}

function resolveModels(
  mode: AiProviderCredentials["mode"],
  args: Args,
): LocalModels {
  const defaults = defaultModelsForMode(mode);
  return {
    analysisModels: args.analysisModels ?? envList("ANALYSIS_MODELS") ?? defaults.analysisModels,
    synthesisModel: args.synthesisModel ?? process.env.SYNTHESIS_MODEL ?? defaults.synthesisModel,
    ruleModel: args.ruleModel ?? process.env.RULE_MODEL ?? defaults.ruleModel,
    skillModel: args.skillModel ?? process.env.SKILL_MODEL ?? defaults.skillModel,
  };
}

function validateModelCompatibility(credentials: AiProviderCredentials, models: LocalModels) {
  const allModels = [
    ...models.analysisModels,
    models.synthesisModel,
    models.ruleModel,
    models.skillModel,
  ];
  for (const model of allModels) {
    if (credentials.mode === "openai" && !model.startsWith("openai/")) {
      throw new Error(`OpenAI key mode cannot use model ${model}. Use an openai/... model.`);
    }
    if (credentials.mode === "anthropic" && !model.startsWith("anthropic/")) {
      throw new Error(`Anthropic key mode cannot use model ${model}. Use an anthropic/... model.`);
    }
    if (
      credentials.mode === "direct" &&
      !model.startsWith("openai/") &&
      !model.startsWith("anthropic/")
    ) {
      throw new Error(
        `Direct key mode only supports openai/... and anthropic/... models, not ${model}.`,
      );
    }
  }
}

function defaultModelsForMode(mode: AiProviderCredentials["mode"]) {
  if (mode === "openai") {
    return {
      analysisModels: [DEFAULT_SKILL_MODEL],
      synthesisModel: DEFAULT_SKILL_MODEL,
      ruleModel: DEFAULT_SKILL_MODEL,
      skillModel: DEFAULT_SKILL_MODEL,
    };
  }
  if (mode === "anthropic") {
    return {
      analysisModels: ["anthropic/claude-sonnet-4-6"],
      synthesisModel: "anthropic/claude-sonnet-4-6",
      ruleModel: "anthropic/claude-sonnet-4-6",
      skillModel: "anthropic/claude-sonnet-4-6",
    };
  }
  return {
    analysisModels: [...DEFAULT_ANALYSIS_MODELS],
    synthesisModel: DEFAULT_SYNTHESIS_MODEL,
    ruleModel: DEFAULT_RULE_MODEL,
    skillModel: DEFAULT_SKILL_MODEL,
  };
}

async function indexImages(
  imageDir: string,
  maxImages: number,
  outDir: string,
): Promise<LocalImage[]> {
  const absoluteDir = path.resolve(repoRoot, imageDir);
  const names = await readdir(absoluteDir).catch((error) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`Image directory not found: ${imageDir}`);
    }
    throw error;
  });
  const files = names
    .filter((name) => mediaTypeFor(name) !== null)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .slice(0, maxImages);
  const seen = new Set<string>();
  const images: LocalImage[] = [];

  for (const name of files) {
    const absolutePath = path.join(absoluteDir, name);
    const bytes = await readFile(absolutePath);
    const digest = sha256(bytes);
    if (seen.has(digest)) {
      log(`Skipping duplicate ${name}`);
      continue;
    }
    seen.add(digest);
    const relativePath = path.relative(repoRoot, absolutePath);
    images.push({
      id: `img_${String(images.length + 1).padStart(4, "0")}`,
      basename: name,
      absolutePath,
      relativePath,
      mediaType: mediaTypeFor(name) ?? "application/octet-stream",
      sha256: digest,
      width: null,
      height: null,
      bytes: bytes.byteLength,
    });
  }

  const rows = images.map((image) =>
    JSON.stringify({
      id: image.id,
      path: image.relativePath,
      basename: image.basename,
      sha256: image.sha256,
      bytes: image.bytes,
      width: image.width,
      height: image.height,
      createdAt: new Date().toISOString(),
    }),
  );
  await writeArtifact(
    outDir,
    "01-corpus/images.jsonl",
    `${rows.join("\n")}${rows.length ? "\n" : ""}`,
  );
  return images;
}

async function reduceRuleResults(input: {
  credentials: AiProviderCredentials;
  model: string;
  results: RuleChunkResult[];
  fanIn: number;
  outDir: string;
}): Promise<RuleChunkResult[]> {
  let current = [...input.results].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  let level = 1;
  while (current.length > input.fanIn) {
    const groups = chunkRuleResults(current, input.fanIn);
    const next: RuleChunkResult[] = [];
    for (const [index, group] of groups.entries()) {
      const id = `merge_${String(level).padStart(2, "0")}_${String(index + 1).padStart(2, "0")}`;
      log(`Merging ${id}`);
      const result = await synthesizeRuleSet({
        credentials: input.credentials,
        model: input.model,
        chunkResults: group,
      });
      await writeArtifact(input.outDir, `03-rule-set/merges/${id}-rules.md`, result.text);
      next.push({
        id,
        files: group.flatMap((chunk) => chunk.files),
        text: result.text,
      });
    }
    current = next;
    level += 1;
  }
  return current;
}

async function writeArtifact(outDir: string, relativePath: string, content: string) {
  const destination = path.join(outDir, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, "utf8");
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

function loadDotEnv(filePath: string) {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    const rawValue = trimmed.slice(equals + 1).trim();
    const value = stripQuotes(rawValue);
    if (!key || value === "" || process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function mediaTypeFor(fileName: string): string | null {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return null;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function providerLabel(credentials: AiProviderCredentials): string {
  if (credentials.mode === "vercel_gateway") return "Vercel AI Gateway";
  if (credentials.mode === "openrouter") return "OpenRouter";
  if (credentials.mode === "openai") return "OpenAI";
  if (credentials.mode === "anthropic") return "Anthropic";
  return "OpenAI + Anthropic";
}

function displayPath(absolutePath: string): string {
  const relative = path.relative(repoRoot, absolutePath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative;
  return absolutePath;
}

function parseProvider(value: string): Args["provider"] {
  if (
    value === "direct" ||
    value === "openrouter" ||
    value === "gateway" ||
    value === "vercel-gateway" ||
    value === "openai" ||
    value === "anthropic"
  ) {
    return value;
  }
  throw new Error(`Unsupported provider: ${value}`);
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index];
  if (!value || value.startsWith("-")) throw new Error(`${option} requires a value.`);
  return value;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} before running.`);
  return value;
}

function envList(name: string): string[] | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function numberFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  return positiveInteger(value, name);
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function log(message: string) {
  console.log(`[taste] ${message}`);
}

function printUsage() {
  console.log(`Usage:
  npm run taste
  npm run taste -- <image-directory>

Keys:
  OPENAI_API_KEY=... and
  ANTHROPIC_API_KEY=...      Intended two-key local default
  OPENROUTER_API_KEY=...     Uses OpenRouter for all models
  AI_GATEWAY_API_KEY=...     Uses Vercel AI Gateway for all models
  OPENAI_API_KEY=...         Uses OpenAI models only
  ANTHROPIC_API_KEY=...      Uses Anthropic models only

Options:
  --provider direct|openrouter|vercel-gateway|openai|anthropic
  --out <dir>
  --skill-name <name>
  --model <provider/model>
  --analysis-models <model,model>

Defaults:
  image directory: reference-images/
  output: .taste/runs/<run-id>/SKILL.md
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
