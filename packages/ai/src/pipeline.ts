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
import { generateGatewayText, generateGatewayVisionText } from "./gateway";
import type {
  ChunkSpec,
  RawAnalysisInput,
  RuleChunkResult,
  SynthesizeImageNoteInput,
  TextGenerationResult,
} from "./types";

export async function analyzeImage(
  input: RawAnalysisInput,
): Promise<TextGenerationResult> {
  return generateGatewayVisionText({
    aiGatewayToken: input.aiGatewayToken,
    model: input.model,
    prompt: buildAnalysisPrompt(input.image),
    image: input.imageInput,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS.analysis,
  });
}

export async function synthesizeImageNote(
  input: SynthesizeImageNoteInput,
): Promise<TextGenerationResult> {
  return generateGatewayVisionText({
    aiGatewayToken: input.aiGatewayToken,
    model: input.model,
    prompt: buildSynthesisPrompt({
      image: input.image,
      analyses: input.analyses,
    }),
    image: input.imageInput,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS.synthesizedNote,
  });
}

export async function extractRuleChunk(input: {
  aiGatewayToken?: string | undefined;
  model: string;
  chunk: ChunkSpec;
}): Promise<TextGenerationResult> {
  return generateGatewayText({
    aiGatewayToken: input.aiGatewayToken,
    model: input.model,
    prompt: buildChunkPrompt(input.chunk),
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS.ruleChunk,
  });
}

export async function synthesizeRuleSet(input: {
  aiGatewayToken?: string | undefined;
  model: string;
  chunkResults: RuleChunkResult[];
}): Promise<TextGenerationResult> {
  return generateGatewayText({
    aiGatewayToken: input.aiGatewayToken,
    model: input.model,
    prompt: buildRuleSetPrompt(input.chunkResults),
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS.ruleSet,
  });
}

export async function generateSkill(input: {
  aiGatewayToken?: string | undefined;
  model: string;
  ruleSet: string;
}): Promise<TextGenerationResult> {
  const result = await generateGatewayText({
    aiGatewayToken: input.aiGatewayToken,
    model: input.model,
    prompt: buildSkillPrompt(input.ruleSet),
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS.skill,
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
