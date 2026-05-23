import { randomUUID } from "node:crypto";
import { z } from "zod";

import { DEFAULT_GENERATOR_MODEL, DEFAULT_RESEARCHER_MODEL } from "./defaults";
import { callOpenRouter, parseJsonObject } from "./openrouter";
import { readLabSession, writeLabSession } from "./store";
import type {
  LabApiSessionResponse,
  LabCandidate,
  LabHypothesis,
  LabRound,
  LabSession,
  LabVote,
  TokenUsage,
} from "./types";

export { DEFAULT_GENERATOR_MODEL, DEFAULT_RESEARCHER_MODEL } from "./defaults";

type StartLabInput = {
  baseSkill: string;
  sourceRuleSet: string;
  taskPrompt: string;
  generatorModel: string;
  researcherModel: string;
  candidateCount: number;
  openrouterApiKey?: string | undefined;
};

type VoteLabInput = {
  sessionId: string;
  roundId: string;
  winnerCandidateId: string;
  reason?: string | undefined;
  openrouterApiKey?: string | undefined;
};

type CandidateSpec = {
  kind: "baseline" | "variant";
  title: string;
  hypothesis: string;
  rationale: string;
  skill: string;
};

const hypothesisSchema = z.object({
  hypotheses: z.array(
    z.object({
      title: z.string().min(1),
      rationale: z.string().min(1),
      changeSummary: z.string().min(1),
      rewriteInstructions: z.string().min(1),
    }),
  ),
});

type HypothesisPlan = z.infer<typeof hypothesisSchema>["hypotheses"][number];

const updatePlanSchema = z.object({
  preferenceSummary: z.string().min(1),
  changeLog: z.array(z.string().min(1)).default([]),
  rewriteInstructions: z.string().min(1),
});

const SKILL_HYPOTHESIS_INVARIANT = `Hypotheses are about alternative ways to write the SKILL.md from the source rule set.
They must compare skill-file strategies: structure, section weight, rule hierarchy, specificity,
example density, wording, ordering, compression, expansion, and emphasis. They must not mention
or optimize for the comparison request, rendered artifacts, or any single output domain.`;

export async function startLabSession(input: StartLabInput): Promise<LabApiSessionResponse> {
  const openrouterApiKey = resolveOpenRouterApiKey(input.openrouterApiKey);
  if (input.sourceRuleSet.trim().length < 100) {
    throw new Error("Source rule set markdown is required before optimizing a skill.");
  }
  const now = timestamp();
  const session: LabSession = {
    id: randomId("lab"),
    mode: "openrouter",
    taskPrompt: input.taskPrompt,
    generatorModel: input.generatorModel,
    researcherModel: input.researcherModel,
    candidateCount: input.candidateCount,
    sourceRuleSet: input.sourceRuleSet,
    initialSkill: input.baseSkill,
    currentSkill: input.baseSkill,
    rounds: [],
    votes: [],
    events: [
      `Created lab session with ${input.candidateCount} variants per round.`,
      "Using OpenRouter model calls.",
    ],
    createdAt: now,
    updatedAt: now,
  };

  session.rounds.push(
    await generateRound({
      session,
      baselineSkill: input.baseSkill,
      sourceRuleSet: input.sourceRuleSet,
      openrouterApiKey,
    }),
  );
  session.updatedAt = timestamp();
  await writeLabSession(session);
  return toSessionResponse(session);
}

export async function voteAndAdvance(input: VoteLabInput): Promise<LabApiSessionResponse> {
  const session = await readLabSession(input.sessionId);
  const round = session.rounds.find((item) => item.id === input.roundId);
  if (!round) throw new Error("Lab round was not found.");
  if (session.votes.some((vote) => vote.roundId === round.id)) {
    throw new Error("This lab round already has a recorded vote.");
  }

  const winner = round.candidates.find((candidate) => candidate.id === input.winnerCandidateId);
  if (!winner) throw new Error("Winning candidate was not found.");

  const openrouterApiKey = resolveOpenRouterApiKey(input.openrouterApiKey);
  session.mode = "openrouter";
  session.events.push("Using OpenRouter model calls.");

  const update = await updateSkillFromVote({
    session,
    round,
    winner,
    reason: input.reason,
    openrouterApiKey,
  });

  const vote: LabVote = {
    id: randomId("vote"),
    roundId: round.id,
    winnerCandidateId: winner.id,
    reason: input.reason?.trim() ? input.reason.trim() : null,
    selectedAt: timestamp(),
    updatedSkill: update.updatedSkill,
    changeLog: update.changeLog,
    preferenceSummary: update.preferenceSummary,
    model: update.model,
    usage: update.usage,
  };

  session.currentSkill = update.updatedSkill;
  session.votes.push(vote);
  session.events.push(`Round ${round.index} winner: ${winner.title}.`);
  session.rounds.push(
    await generateRound({
      session,
      baselineSkill: update.updatedSkill,
      sourceRuleSet: session.sourceRuleSet,
      openrouterApiKey,
    }),
  );
  session.updatedAt = timestamp();
  await writeLabSession(session);
  return toSessionResponse(session);
}

export async function getLabSession(sessionId: string): Promise<LabApiSessionResponse> {
  return toSessionResponse(await readLabSession(sessionId));
}

async function generateRound(input: {
  session: LabSession;
  baselineSkill: string;
  sourceRuleSet: string;
  openrouterApiKey: string | null;
}): Promise<LabRound> {
  const roundIndex = input.session.rounds.length + 1;
  const hypotheses = await generateHypotheses(
    input.session,
    input.baselineSkill,
    input.sourceRuleSet,
    requireOpenRouterApiKey(input.openrouterApiKey),
  );

  const specs: CandidateSpec[] = [
    {
      kind: "baseline",
      title: "Current baseline",
      hypothesis: "No skill change.",
      rationale: "The current skill is kept as a control.",
      skill: input.baselineSkill,
    },
    ...hypotheses.slice(0, input.session.candidateCount).map((hypothesis) => ({
      kind: "variant" as const,
      title: hypothesis.title,
      hypothesis: hypothesis.changeSummary,
      rationale: hypothesis.rationale,
      skill: hypothesis.variantSkill,
    })),
  ];

  const candidates: LabCandidate[] = [];
  for (const spec of specs) {
    candidates.push(
      await generateCandidate({
        session: input.session,
        spec,
        openrouterApiKey: input.openrouterApiKey,
      }),
    );
  }

  return {
    id: randomId("round"),
    index: roundIndex,
    taskPrompt: input.session.taskPrompt,
    baselineSkill: input.baselineSkill,
    hypotheses,
    candidates,
    createdAt: timestamp(),
  };
}

async function generateHypotheses(
  session: LabSession,
  baselineSkill: string,
  sourceRuleSet: string,
  openrouterApiKey: string,
): Promise<LabHypothesis[]> {
  let plans = await generateHypothesisPlans({
    session,
    baselineSkill,
    sourceRuleSet,
    openrouterApiKey,
  });

  const firstViolation = findHypothesisInvariantViolation(plans);
  if (firstViolation) {
    plans = await generateHypothesisPlans({
      session,
      baselineSkill,
      sourceRuleSet,
      openrouterApiKey,
      rejection: firstViolation,
    });
  }

  const finalViolation = findHypothesisInvariantViolation(plans);
  if (finalViolation) {
    throw new Error(`Researcher returned a prompt-specific hypothesis: ${finalViolation}`);
  }

  const skills: string[] = [];
  for (const hypothesis of plans) {
    skills.push(
      await generateVariantSkill({
        session,
        baselineSkill,
        sourceRuleSet,
        hypothesis,
        openrouterApiKey,
      }),
    );
  }

  return plans.map((hypothesis, index) => {
    const variantSkill = skills[index];
    if (!variantSkill) throw new Error("A generated variant skill was missing.");
    return {
      id: `h${index + 1}`,
      title: hypothesis.title,
      rationale: hypothesis.rationale,
      changeSummary: hypothesis.changeSummary,
      variantSkill,
    };
  });
}

async function generateHypothesisPlans(input: {
  session: LabSession;
  baselineSkill: string;
  sourceRuleSet: string;
  openrouterApiKey: string;
  rejection?: string | undefined;
}): Promise<HypothesisPlan[]> {
  const result = await callOpenRouter({
    apiKey: input.openrouterApiKey,
    model: input.session.researcherModel,
    json: true,
    temperature: 0.9,
    maxTokens: 5000,
    label: "skill hypothesis metadata",
    retries: 1,
    messages: [
      {
        role: "system",
        content:
          "You design experiments over reusable SKILL.md writing strategies. Return strict JSON metadata only.",
      },
      {
        role: "user",
        content: `Create exactly ${input.session.candidateCount} bounded mutation hypotheses for the SKILL.md file.

${SKILL_HYPOTHESIS_INVARIANT}

Each hypothesis must answer this question: what different way of writing the skill might better preserve or operationalize the source rule set than the current baseline skill?

Good hypothesis axes include:
- over-indexing one section of the source rule set versus balancing all sections
- long granular rule lists versus short principles
- procedural checklists versus declarative taste constraints
- anti-pattern-heavy guidance versus positive construction recipes
- front-loaded hierarchy versus distributed local rules
- concrete examples versus abstract design language

Do not include a complete rewritten SKILL.md in this response. Include compact rewriteInstructions that another pass can use to produce the complete variant skill.

${input.rejection ? `The previous attempt was rejected because it violated the invariant: ${input.rejection}\nReturn a fresh set that avoids that violation.` : ""}

Preference history:
${preferenceHistory(input.session)}

Source rule set that the skill was generated from:
<source-rule-set>
${input.sourceRuleSet}
</source-rule-set>

Return JSON: {"hypotheses":[{"title":"","rationale":"","changeSummary":"","rewriteInstructions":""}]}

Current baseline skill:
<skill>
${input.baselineSkill}
</skill>`,
      },
    ],
  });
  const parsed = hypothesisSchema.parse(parseJsonObject<unknown>(result.text));
  return parsed.hypotheses.slice(0, input.session.candidateCount);
}

async function generateVariantSkill(input: {
  session: LabSession;
  baselineSkill: string;
  sourceRuleSet: string;
  hypothesis: HypothesisPlan;
  openrouterApiKey: string;
}): Promise<string> {
  const result = await callOpenRouter({
    apiKey: input.openrouterApiKey,
    model: input.session.researcherModel,
    temperature: 0.55,
    maxTokens: 14000,
    label: `variant skill rewrite: ${input.hypothesis.title}`,
    retries: 1,
    messages: [
      {
        role: "system",
        content:
          "You rewrite Codex SKILL.md files. Return only the complete rewritten SKILL.md markdown. Do not wrap it in markdown fences.",
      },
      {
        role: "user",
        content: `Rewrite the current baseline SKILL.md according to this hypothesis.

${SKILL_HYPOTHESIS_INVARIANT}

The result must remain a general reusable design-generation skill. Apply only the proposed skill-writing strategy. Do not add rules for any particular output domain unless that domain already appears as a general rule in the source rule set or baseline skill.

Hypothesis title: ${input.hypothesis.title}
Hypothesis rationale: ${input.hypothesis.rationale}
Change summary: ${input.hypothesis.changeSummary}
Rewrite instructions:
${input.hypothesis.rewriteInstructions}

Use the original source rule set as ground truth for what the skill is trying to preserve:
<source-rule-set>
${truncateForPrompt(input.sourceRuleSet, 30000)}
</source-rule-set>

Current baseline skill:
<skill>
${input.baselineSkill}
</skill>`,
      },
    ],
  });

  return normalizeMarkdownDocument(result.text, "variant skill");
}

async function generateCandidate(input: {
  session: LabSession;
  spec: CandidateSpec;
  openrouterApiKey: string | null;
}): Promise<LabCandidate> {
  const generation = await generateHtmlWithOpenRouter(
    input.session,
    input.spec.skill,
    requireOpenRouterApiKey(input.openrouterApiKey),
    input.spec.title,
  );

  return {
    id: randomId(input.spec.kind === "baseline" ? "base" : "variant"),
    kind: input.spec.kind,
    title: input.spec.title,
    hypothesis: input.spec.hypothesis,
    rationale: input.spec.rationale,
    skill: input.spec.skill,
    html: normalizeHtml(generation.html),
    model: generation.model,
    usage: generation.usage,
    createdAt: timestamp(),
  };
}

async function generateHtmlWithOpenRouter(
  session: LabSession,
  skill: string,
  openrouterApiKey: string,
  title: string,
): Promise<{ html: string; model: string; usage: TokenUsage | null }> {
  const result = await callOpenRouter({
    apiKey: openrouterApiKey,
    model: session.generatorModel,
    temperature: 0.8,
    maxTokens: 9000,
    label: `candidate artifact: ${title}`,
    retries: 2,
    messages: [
      {
        role: "system",
        content: `You are a frontend design generator. Use the provided SKILL.md as the active design skill.

Return exactly one complete, self-contained HTML document. Do not use markdown fences. Do not fetch external scripts, fonts, images, or stylesheets. Use static HTML and CSS only. The output must render directly inside an iframe.

<skill>
${skill}
</skill>`,
      },
      { role: "user", content: session.taskPrompt },
    ],
  });
  return { html: result.text, model: result.model, usage: result.usage };
}

async function updateSkillFromVote(input: {
  session: LabSession;
  round: LabRound;
  winner: LabCandidate;
  reason?: string | undefined;
  openrouterApiKey: string;
}): Promise<{
  updatedSkill: string;
  preferenceSummary: string;
  changeLog: string[];
  model: string;
  usage: TokenUsage | null;
}> {
  const candidates = input.round.candidates
    .map(
      (candidate) => `<candidate id="${candidate.id}" winner="${candidate.id === input.winner.id}">
Title: ${candidate.title}
Kind: ${candidate.kind}
Hypothesis: ${candidate.hypothesis}
Rationale: ${candidate.rationale}
Skill:
${truncateForPrompt(candidate.skill, 12000)}
Generated HTML:
${truncateForPrompt(candidate.html, 10000)}
</candidate>`,
    )
    .join("\n\n");

  const planResult = await callOpenRouter({
    apiKey: input.openrouterApiKey,
    model: input.session.researcherModel,
    json: true,
    temperature: 0.45,
    maxTokens: 12000,
    label: "vote update plan",
    retries: 1,
    messages: [
      {
        role: "system",
        content:
          "You plan reusable design-generation skill updates from one blind human preference experiment. Return strict JSON metadata only.",
      },
      {
        role: "user",
        content: `A human selected ${input.winner.id} (${input.winner.title}) in a blind measurement run.

Human note: ${input.reason?.trim() ? input.reason.trim() : "(none)"}

Preference history:
${preferenceHistory(input.session)}

${SKILL_HYPOTHESIS_INVARIANT}

The comparison request is intentionally omitted because it is not the optimization target. Rendered artifacts are evidence of what each SKILL.md writing strategy caused, but do not name or optimize for their observed domain. Infer what this preference says about the structure, emphasis, ordering, specificity, and phrasing of the SKILL.md file as a general reusable skill.

Use the original source rule set as the ground truth for what the skill is trying to preserve:
<source-rule-set>
${input.session.sourceRuleSet}
</source-rule-set>

Do not simply copy the winner unless that is genuinely best. Infer what made the winner better and preserve useful baseline rules.

Do not include a complete rewritten SKILL.md in this response. Return JSON:
{"preferenceSummary":"","changeLog":[""],"rewriteInstructions":""}

Current baseline:
<baseline-skill>
${input.round.baselineSkill}
</baseline-skill>

Candidates:
${candidates}`,
      },
    ],
  });
  const parsed = updatePlanSchema.parse(parseJsonObject<unknown>(planResult.text));
  const rewriteResult = await rewriteSkillFromPreference({
    session: input.session,
    round: input.round,
    winner: input.winner,
    reason: input.reason,
    preferenceSummary: parsed.preferenceSummary,
    changeLog: parsed.changeLog,
    rewriteInstructions: parsed.rewriteInstructions,
    openrouterApiKey: input.openrouterApiKey,
  });

  return {
    updatedSkill: rewriteResult.updatedSkill,
    preferenceSummary: parsed.preferenceSummary,
    changeLog: parsed.changeLog,
    model: rewriteResult.model,
    usage: combineUsage(planResult.usage, rewriteResult.usage),
  };
}

async function rewriteSkillFromPreference(input: {
  session: LabSession;
  round: LabRound;
  winner: LabCandidate;
  reason?: string | undefined;
  preferenceSummary: string;
  changeLog: string[];
  rewriteInstructions: string;
  openrouterApiKey: string;
}): Promise<{ updatedSkill: string; model: string; usage: TokenUsage | null }> {
  const result = await callOpenRouter({
    apiKey: input.openrouterApiKey,
    model: input.session.researcherModel,
    temperature: 0.45,
    maxTokens: 14000,
    label: "next baseline skill rewrite",
    retries: 1,
    messages: [
      {
        role: "system",
        content:
          "You rewrite Codex SKILL.md files from human preference evidence. Return only the complete rewritten SKILL.md markdown. Do not wrap it in markdown fences.",
      },
      {
        role: "user",
        content: `Produce the next baseline SKILL.md from this preference result.

${SKILL_HYPOTHESIS_INVARIANT}

The comparison request is intentionally omitted. Preserve the skill's reusable visual rule-set purpose and do not specialize toward the observed artifact domain.

Human selected: ${input.winner.id} (${input.winner.title})
Human note: ${input.reason?.trim() ? input.reason.trim() : "(none)"}
Preference summary:
${input.preferenceSummary}

Change log:
${input.changeLog.map((item) => `- ${item}`).join("\n") || "- (none)"}

Rewrite instructions:
${input.rewriteInstructions}

Use the original source rule set as ground truth:
<source-rule-set>
${truncateForPrompt(input.session.sourceRuleSet, 30000)}
</source-rule-set>

Current baseline:
<baseline-skill>
${input.round.baselineSkill}
</baseline-skill>

Winning candidate skill:
<winner-skill>
${input.winner.skill}
</winner-skill>`,
      },
    ],
  });

  return {
    updatedSkill: normalizeMarkdownDocument(result.text, "updated skill"),
    model: result.model,
    usage: result.usage,
  };
}

function normalizeHtml(text: string): string {
  const trimmed = text
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (/^<!doctype html>/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) return trimmed;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Generated candidate</title></head><body>${trimmed}</body></html>`;
}

function findHypothesisInvariantViolation(plans: HypothesisPlan[]): string | null {
  const bannedPatterns = [
    /\bdashboard(s)?\b/i,
    /\btask prompt\b/i,
    /\btest prompt\b/i,
    /\bmeasurement prompt\b/i,
    /\bcurrent prompt\b/i,
    /\buser prompt\b/i,
    /\biframe(s)?\b/i,
    /\bgenerated html\b/i,
    /\bhtml\/css\b/i,
  ];

  for (const plan of plans) {
    const text = [
      plan.title,
      plan.rationale,
      plan.changeSummary,
      plan.rewriteInstructions,
    ].join("\n");
    const matched = bannedPatterns.find((pattern) => pattern.test(text));
    if (matched) {
      return `"${plan.title}" mentioned ${matched.source}. Hypotheses must be about SKILL.md writing strategy only.`;
    }
  }

  return null;
}

function normalizeMarkdownDocument(text: string, label: string): string {
  const trimmed = text
    .trim()
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (trimmed.length < 1000) {
    throw new Error(`OpenRouter returned a ${label} that was too short to use.`);
  }

  return trimmed;
}

function combineUsage(...usageItems: (TokenUsage | null)[]): TokenUsage | null {
  const present = usageItems.filter((usage): usage is TokenUsage => usage !== null);
  if (present.length === 0) return null;

  return {
    inputTokens: sumNullable(present.map((usage) => usage.inputTokens)),
    outputTokens: sumNullable(present.map((usage) => usage.outputTokens)),
    totalTokens: sumNullable(present.map((usage) => usage.totalTokens)),
  };
}

function sumNullable(values: (number | null)[]): number | null {
  let total = 0;
  let sawNumber = false;
  for (const value of values) {
    if (value === null) continue;
    total += value;
    sawNumber = true;
  }
  return sawNumber ? total : null;
}

function resolveOpenRouterApiKey(openrouterApiKey: string | undefined): string {
  const apiKey = openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim() || "";
  if (!apiKey) {
    throw new Error("OpenRouter API key is required for the skill lab.");
  }
  return apiKey;
}

function requireOpenRouterApiKey(openrouterApiKey: string | null): string {
  if (!openrouterApiKey) throw new Error("OpenRouter API key is required for the skill lab.");
  return openrouterApiKey;
}

function toSessionResponse(session: LabSession): LabApiSessionResponse {
  const activeRound = session.rounds[session.rounds.length - 1];
  if (!activeRound) throw new Error("Lab session has no active round.");
  return { session, activeRound };
}

function preferenceHistory(session: LabSession): string {
  if (session.votes.length === 0) return "(none yet)";
  return session.votes.map((vote, index) => `${index + 1}. ${vote.preferenceSummary}`).join("\n");
}

function truncateForPrompt(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n[truncated]`;
}

function randomId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function timestamp(): string {
  return new Date().toISOString();
}
