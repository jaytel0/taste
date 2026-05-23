import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  SKILL_FRONTMATTER,
} from "./config";
import {
  buildAnalysisPrompt,
  buildChunkPrompt,
  buildRuleSetPrompt,
  buildSkillPrompt,
  buildSynthesisPrompt,
} from "./prompts";
import { generateProviderText, generateProviderVisionText } from "./providers";
import type {
  AiProviderCredentials,
  ChunkSpec,
  RawAnalysisInput,
  RuleChunkResult,
  SynthesizeImageNoteInput,
  TextGenerationResult,
} from "./types";

export async function analyzeImage(
  input: RawAnalysisInput,
): Promise<TextGenerationResult> {
  return generateProviderVisionText({
    credentials: input.credentials,
    model: input.model,
    prompt: buildAnalysisPrompt(input.image),
    image: input.imageInput,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS.analysis,
    abortSignal: input.abortSignal,
  });
}

export async function synthesizeImageNote(
  input: SynthesizeImageNoteInput,
): Promise<TextGenerationResult> {
  return generateProviderVisionText({
    credentials: input.credentials,
    model: input.model,
    prompt: buildSynthesisPrompt({
      image: input.image,
      analyses: input.analyses,
    }),
    image: input.imageInput,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS.synthesizedNote,
    abortSignal: input.abortSignal,
  });
}

export async function extractRuleChunk(input: {
  credentials?: AiProviderCredentials | undefined;
  model: string;
  chunk: ChunkSpec;
  abortSignal?: AbortSignal | undefined;
}): Promise<TextGenerationResult> {
  return generateProviderText({
    credentials: input.credentials,
    model: input.model,
    prompt: buildChunkPrompt(input.chunk),
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS.ruleChunk,
    abortSignal: input.abortSignal,
  });
}

export async function synthesizeRuleSet(input: {
  credentials?: AiProviderCredentials | undefined;
  model: string;
  chunkResults: RuleChunkResult[];
  abortSignal?: AbortSignal | undefined;
}): Promise<TextGenerationResult> {
  return generateProviderText({
    credentials: input.credentials,
    model: input.model,
    prompt: buildRuleSetPrompt(input.chunkResults),
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS.ruleSet,
    abortSignal: input.abortSignal,
  });
}

export async function generateSkill(input: {
  credentials?: AiProviderCredentials | undefined;
  model: string;
  ruleSet: string;
  abortSignal?: AbortSignal | undefined;
}): Promise<TextGenerationResult> {
  const result = await generateProviderText({
    credentials: input.credentials,
    model: input.model,
    prompt: buildSkillPrompt(input.ruleSet),
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS.skill,
    abortSignal: input.abortSignal,
  });
  const body = result.text.trim();
  return {
    ...result,
    text: `${SKILL_FRONTMATTER}${stripFrontmatter(body)}`,
  };
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n*/, "").trim();
}
