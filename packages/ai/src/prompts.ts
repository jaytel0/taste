import type { ChunkSpec, RuleChunkResult, TasteImage } from "./types";

export function buildAnalysisPrompt(image: TasteImage): string {
  return `You are analyzing one UI/interface design screenshot as part of a design taste corpus. The image is a verified, human-curated example of good visual design. Your task is to extract the aesthetic DNA, not explain the product.

Be specific and visual. Do not give generic praise. Do not merely list visible UI elements.

CRITICAL FOCUS: This analysis is about aesthetics and taste only: style, layout, hierarchy, color, shadows, materials, spacing, composition, density, rhythm, visual tension, polish, restraint, and vibe. The screen's domain, scenario, copy, app category, user names, depicted objects, and functional workflow are not the target. Treat them as incidental raw material unless they reveal a broader aesthetic move.

Do not create principles like "make it hospitable," "concierge-like," "guest-focused," "travel-oriented," or anything tied to the subject matter. Instead translate what you see into domain-independent visual principles such as "large centered identity mass above quiet modular cards," "single semantic accent against a monochrome field," "soft depth without borders," or "image warmth carries color while UI chrome stays neutral."

Extract transferable aesthetic principles that could guide an unrelated interface in the same taste.

Image metadata:
- id: ${image.id}
- filename: ${image.basename}
- dimensions: ${formatDimensions(image)}

Write a deep analysis with these sections:

# ${image.id} — ${image.basename}

## 1. Visual composition only
Briefly describe the visual arrangement, major shapes, alignment, surfaces, and focal points. Keep functional/domain description minimal.

## 2. What makes the aesthetic strong
Identify the strongest visual qualities and why they work as design/taste moves, independent of the screen's subject matter.

## 3. Layout and composition principles
Discuss grid, alignment, framing, hierarchy, grouping, density, whitespace, and visual rhythm.

## 4. Typography principles
Discuss scale, weight, contrast, text density, labels, headings, and how type creates hierarchy.

## 5. Color, material, light, and depth principles
Discuss palette, contrast, gradients, shadows, borders, surfaces, translucency, and restraint.

## 6. Aesthetic mood / vibe
Describe the visual vibe using domain-independent aesthetic language. Avoid product/domain interpretations.

## 7. Transferable aesthetic principles
List 10-18 principles that could guide unrelated interface designs in the same taste. Phrase these as reusable visual design rules, not observations and not domain/content advice.

## 8. What to ignore as incidental
List content, copy, subject matter, domain, depicted objects, and functional details that should NOT become taste rules.

## 9. Aesthetic tags
Provide 10-20 concise, domain-independent tags.
`;
}

export function buildSynthesisPrompt(input: {
  image: TasteImage;
  analyses: Array<{ model?: string | null; text: string }>;
}): string {
  const analysisSections = buildAnonymousAnalysisSections(input.analyses);
  return `You are rectifying two independent visual analyses of the same UI screenshot into one canonical master vision note for a design taste corpus. The screenshot is a verified, human-curated example of good visual design. Your job is to extract aesthetic DNA, not product meaning.

This master note is about aesthetics and taste only: style, layout, hierarchy, color, shadows, materials, spacing, composition, density, rhythm, visual tension, polish, restraint, and vibe. The screen's domain, scenario, copy, app category, user names, depicted objects, and functional workflow are not the target. Treat them as incidental raw material unless they reveal a broader aesthetic move.

Do not preserve conclusions like "concierge," "hospitable," "guest-focused," "travel-oriented," or other domain/subject-matter interpretations. Translate those into domain-independent visual ideas: quiet generosity, centered hero mass, restrained semantic accent, soft modular surfaces, tactile counterpoint, calm density, etc.

The analyses below are intentionally anonymized and source-neutral. Treat them as peer evidence. Do not infer which model produced either analysis, and do not favor an analysis because it resembles your own wording. Adjudicate disagreements by looking at the image again.

Look at the image again. Use the two analyses as evidence, but correct anything that seems too functional, content-specific, overstated, brand-specific, or not actually visible. Preserve sharp aesthetic insights. Remove duplication. The output should become the definitive per-image taste note for later cross-image synthesis.

Image metadata:
- id: ${input.image.id}
- filename: ${input.image.basename}
- dimensions: ${formatDimensions(input.image)}

${analysisSections}

Write the master note with this structure:

# ${input.image.id} — ${input.image.basename} Master Vision

## 1. Visual summary
A concise but specific description of the visual composition only: shapes, alignment, hierarchy, surfaces, density, and focal points. Keep domain/function minimal.

## 2. Why this aesthetic works
The most important visual strengths and why they matter as design/taste moves, independent of the screen's subject matter.

## 3. Transferable aesthetic principles
12-18 reusable aesthetic/design principles, phrased as rules that could guide unrelated interfaces. These must be domain-independent and should not mention the screen's scenario, content, or function.

## 4. Pattern categories
Group the principles under layout/composition, typography, color/material/depth, density/spacing, aesthetic mood, and restraint/avoidance.

## 5. What is incidental or too literal
Screen content, functionality, product category, copy, depicted objects, names, scenario, or reference-specific details that should not become general taste rules.

## 6. Evidence tags
15-25 concise, domain-independent aesthetic tags that will help cluster this image with others later.
`;
}

function buildAnonymousAnalysisSections(
  analyses: Array<{ model?: string | null; text: string }>,
): string {
  const sourceModels = analyses
    .map((analysis) => analysis.model)
    .filter((model): model is string => typeof model === "string" && model.trim().length > 0);

  return analyses
    .map((analysis, index) => {
      const text = anonymizeAnalysisText(analysis.text, sourceModels);
      return `Analysis ${index + 1}:\n---\n${text}\n---`;
    })
    .join("\n\n");
}

function anonymizeAnalysisText(text: string, sourceModels: string[]): string {
  const body = stripLeadingFrontmatter(text);
  return modelAliases(sourceModels).reduce(
    (current, alias) => current.replace(new RegExp(escapeRegExp(alias), "gi"), "[redacted]"),
    body,
  );
}

function stripLeadingFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

function modelAliases(models: string[]): string[] {
  return Array.from(
    new Set(
      models.flatMap((model) => {
        const bare = model.includes("/") ? (model.split("/").pop() ?? model) : model;
        const spaced = bare.replace(/[-_]+/g, " ");
        return [model, bare, spaced];
      }),
    ),
  ).filter((alias) => alias.length > 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildChunkPrompt(spec: ChunkSpec): string {
  const bundle = spec.notes
    .map((note) => `\n\n<image-note file="${note.file}">\n${note.text}\n</image-note>`)
    .join("\n");
  return `You are extracting a STRICT, concrete visual rule set from a deterministic subset of canonical image notes.

The previous attempt failed because it over-generalized into broad mood words. Your task is to avoid that failure.

DO NOT summarize the images with vague aesthetic labels. Avoid words such as luxury, premium, editorial, tactile, sophisticated, elegant, boutique, fashion, lifestyle, atmospheric, cinematic, gallery-like, high-end, warm, tasteful, beautiful, elevated, object-like, or refined unless you are explicitly listing terms to avoid. These words trigger model stereotypes and are not useful rules.

DO extract direct production rules a model can follow without making open-ended aesthetic decisions.

A good rule is:
- observable in the image notes,
- specific enough to implement,
- transferable across domains,
- declarative, not optional,
- about visible design decisions: typography, color, shadows, radius, spacing, density, alignment, borders, surfaces, icon/detail treatment, composition.

A bad rule is:
- mood/vibe language,
- a broad principle such as "make it premium",
- an invitation for the model to choose a style,
- tied to product domain/content/copy,
- a fashion/luxury/serif/beige stereotype.

Chunk ${spec.id}
Files: ${spec.notes.map((note) => note.file).join(", ")}

Input notes:${bundle}

Write a chunk rule extraction with these exact sections:

# ${spec.id} Concrete Visual Rules

## Rules to keep
Write 40-70 specific, imperative rules. Be dictator-driven. Prefer "Use...", "Set...", "Avoid...", "Do not...". Do not hedge with "often" unless the source genuinely conflicts.

## Numeric / relational constraints
Where exact values are unavailable, give useful relative constraints: low saturation, one accent max, thin borders, large soft blur, generous padding, few type weights, localized density, etc.

## Prohibited model shortcuts
List concrete shortcuts the generator must not use: beige luxury fashion default, serif monogram avatar, boutique brand naming, terracotta-by-default, lifestyle product copy, fake phone frame unless asked, etc., but only include shortcuts supported by the risk in this chunk or by obvious model-prior risk.

## Source-specific content to discard
List content/domain/copy/signifier observations that should not become style rules.
`;
}

export function buildRuleSetPrompt(chunkResults: RuleChunkResult[]): string {
  const drafts = chunkResults
    .map((result) => `\n\n<chunk-rules id="${result.id}" files="${result.files.join(",")}">\n${result.text}\n</chunk-rules>`)
    .join("\n");
  return `You are synthesizing chunk-level rule drafts into one STRICT visual rule set for a design-generation skill.

The previous skill failed by using vague taste words that caused model-prior collapse into beige luxury editorial commerce. Do not repeat that mistake.

You must produce a concrete, declarative, specific, somewhat long rule set. It is okay if it is longer than a typical skill. Specificity is the goal. Do not leave aesthetic choices open for the generator when the reference taste can constrain them.

BANNED AS STYLE GUIDANCE:
Do not use broad labels such as luxury, premium, editorial, tactile, sophisticated, elegant, boutique, fashion, lifestyle, atmospheric, cinematic, gallery-like, high-end, warm, tasteful, beautiful, elevated, object-like, refined, crafted, polished. You may use these only in the anti-pattern section as words/signifiers to avoid relying on.

REQUIRED BEHAVIOR:
- Convert every abstract finding into a visible production constraint.
- Default to concrete choices: neutral sans typography, restrained color, soft shadows, minimal borders, rounded geometry, clear spacing, localized density.
- Forbid stereotype shortcuts: beige luxury commerce, serif display names by default, monogram avatars, boutique brand copy, terracotta as default accent, fake device frames unless requested, fashion/homeware content as aesthetic proxy.
- Keep the design language domain-agnostic. The aesthetic must come from visible structure, not invented content.
- Do not include image IDs, chunk IDs, evidence references, or process notes in the final rule set.
- Make compatible exceptions explicit and bounded; do not leave broad freedom.

Chunk rule drafts:${drafts}

Write the final rule set with this exact structure:

# Taste Rule Set

## 1. Purpose
A short explanation that this is a concrete visual production rule set, not a mood board.

## 2. Non-negotiable defaults
15-25 top-level defaults the generator should follow unless the user explicitly asks otherwise.

## 3. Typography rules
Specific rules for sans-serif defaults, weights, scale, spacing, labels, hierarchy, avoiding serif/luxury-wordmark defaults, etc.

## 4. Color rules
Specific rules for neutral palettes, saturation, accent count/size, avoiding beige/terracotta/fashion palettes by default, dark mode constraints.

## 5. Surface, shadow, and border rules
Specific rules for shadows, radius, fills, value separation, line weight, avoiding glossy/harsh/heavy effects.

## 6. Layout, spacing, and density rules
Specific rules for whitespace, grouping, composition, alignment, responsive layouts, localized density, avoiding generic equal-card grids.

## 7. Detail and component treatment
Specific rules for icons, pills, chips, active states, data rows, cards, avatars, product thumbnails, navigation, status marks.

## 8. Content neutrality rules
Specific rules preventing generated names, brand copy, item categories, avatars, or app brands from carrying the aesthetic.

## 9. Anti-patterns and banned shortcuts
A direct blacklist of visual/content shortcuts that caused or could cause collapse.

## 10. Final generation checklist
A concrete checklist the generator must pass before finishing.
`;
}

export function buildSkillPrompt(ruleSet: string): string {
  return `Convert this concrete visual rule set into a platform-agnostic design skill.

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
}

function formatDimensions(image: TasteImage): string {
  return `${image.width ?? "unknown"}x${image.height ?? "unknown"}`;
}
