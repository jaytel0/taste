#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const rulePath = path.resolve(readFlag("--rule-set") ?? "pipeline/taste/03-rule-set/rule-set.md");
const skillOut = path.resolve(readFlag("--out") ?? "pipeline/taste/04-skill/SKILL.md");
const model = readFlag("--model") ?? "openai/gpt-5.5";
const token = process.env.SHOPIFY_AI_TOKEN;

if (!token) {
  console.error("Missing SHOPIFY_AI_TOKEN. Export your Shopify AI proxy bearer token, then rerun.");
  process.exit(1);
}

const ruleSet = await readFile(rulePath, "utf8");
const prompt = `Convert this concrete visual rule set into a platform-agnostic design skill.

Keep it dictator-driven and specific. Do not soften it into broad aesthetic prose. Length is acceptable. The target model should not infer the aesthetic from vague words.

Rules:
- Preserve concrete visual constraints.
- Use imperative language.
- Avoid broad trigger words as style guidance: luxury, premium, editorial, tactile, sophisticated, elegant, boutique, fashion, lifestyle, atmospheric, cinematic, gallery-like, high-end, warm, tasteful, beautiful, elevated, object-like, refined, crafted, polished.
- You may mention those words only in "Forbidden shortcuts" as words/signifiers not to rely on.
- Make sans-serif typography the default. Serif display type is not a default.
- Make content neutrality explicit.
- Make anti-collapse guardrails explicit.
- Do not mention source images, chunks, models, APIs, experiments, or this process.
- Do not include YAML frontmatter; output only Markdown skill body.

Required structure:

# Taste Skill

## Use this skill when

## Core directive

## Non-negotiable defaults

## Typography

## Color

## Surfaces, shadows, and borders

## Layout, spacing, and density

## Details, states, and components

## Content neutrality

## Forbidden shortcuts

## Generation checklist

Rule set:

<rule-set>
${ruleSet}
</rule-set>
`;

const text = await callOpenAIHigh({ model, prompt });
const body = text.trim();
const skill = `${buildSkillFrontmatter()}${stripFrontmatter(body)}`;
await writeFile(skillOut, skill + "\n", "utf8");
console.log(`Wrote ${skillOut}`);

function buildSkillFrontmatter() {
  const description = "Concrete UI visual rule set for generating and reviewing restrained neutral interfaces. Use for tasks that need exact style constraints: plain sans-serif typography, pale neutral canvases, rounded surfaces, soft shadows, minimal borders, low-saturation color, sparse density, content-neutral placeholders, and anti-collapse guardrails.";
  return [
    "---",
    `name: ${yamlScalar("taste-design")}`,
    `description: ${yamlScalar(description)}`,
    "---",
    "",
  ].join("\n");
}

function yamlScalar(value) {
  return JSON.stringify(value);
}

function stripFrontmatter(markdown) {
  return markdown.replace(/^---\n[\s\S]*?\n---\n*/, "").trim();
}

async function callOpenAIHigh({ model, prompt }) {
  const response = await fetch("https://proxy.shopify.ai/vendors/openai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: model.startsWith("openai/") ? model.slice("openai/".length) : model,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      reasoning: { effort: "high" },
      max_output_tokens: 12000,
    }),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) throw new Error(JSON.stringify(data, null, 2));
  if (typeof data.output_text === "string") return data.output_text;
  const texts = [];
  for (const item of data.output ?? []) {
    for (const part of item?.content ?? []) {
      if (part?.type === "output_text" && typeof part.text === "string") texts.push(part.text);
      else if (typeof part?.text === "string") texts.push(part.text);
    }
  }
  return texts.join("\n\n");
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { status: response.status, raw: text }; }
}

function readFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}
