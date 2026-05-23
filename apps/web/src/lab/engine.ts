import { randomUUID } from "node:crypto";
import { z } from "zod";

import { DEFAULT_GENERATOR_MODEL, DEFAULT_RESEARCHER_MODEL } from "./defaults";
import { callOpenRouter, parseJsonObject } from "./openrouter";
import { readLabSession, writeLabSession } from "./store";
import type {
  LabApiSessionResponse,
  LabCandidate,
  LabHypothesis,
  LabMode,
  LabRound,
  LabSession,
  LabVote,
  TokenUsage,
} from "./types";

export { DEFAULT_GENERATOR_MODEL, DEFAULT_RESEARCHER_MODEL } from "./defaults";

type LabCredentials = {
  mode: LabMode;
  apiKey: string | null;
  event: string | null;
};

type StartLabInput = {
  baseSkill: string;
  taskPrompt: string;
  generatorModel: string;
  researcherModel: string;
  candidateCount: number;
  openrouterApiKey?: string | undefined;
  useMock: boolean;
};

type VoteLabInput = {
  sessionId: string;
  roundId: string;
  winnerCandidateId: string;
  reason?: string | undefined;
  openrouterApiKey?: string | undefined;
  useMock: boolean;
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
      variantSkill: z.string().min(20),
    }),
  ),
});

const updateSchema = z.object({
  updatedSkill: z.string().min(20),
  preferenceSummary: z.string().min(1),
  changeLog: z.array(z.string().min(1)).default([]),
});

export async function startLabSession(input: StartLabInput): Promise<LabApiSessionResponse> {
  const now = timestamp();
  const credentials = resolveCredentials(input.openrouterApiKey, input.useMock);
  const session: LabSession = {
    id: randomId("lab"),
    mode: credentials.mode,
    taskPrompt: input.taskPrompt,
    generatorModel: input.generatorModel,
    researcherModel: input.researcherModel,
    candidateCount: input.candidateCount,
    initialSkill: input.baseSkill,
    currentSkill: input.baseSkill,
    rounds: [],
    votes: [],
    events: [
      `Created lab session with ${input.candidateCount} variants per round.`,
      ...(credentials.event ? [credentials.event] : []),
    ],
    createdAt: now,
    updatedAt: now,
  };

  const round = await generateRound({
    session,
    baselineSkill: input.baseSkill,
    openrouterApiKey: credentials.apiKey,
  });
  session.rounds.push(round);
  session.updatedAt = timestamp();
  await writeLabSession(session);
  return toSessionResponse(session);
}

export async function voteAndAdvance(input: VoteLabInput): Promise<LabApiSessionResponse> {
  const session = await readLabSession(input.sessionId);
  const round = session.rounds.find((item) => item.id === input.roundId);
  if (!round) throw new Error("Lab round was not found.");

  const winner = round.candidates.find((candidate) => candidate.id === input.winnerCandidateId);
  if (!winner) throw new Error("Winning candidate was not found.");
  if (session.votes.some((vote) => vote.roundId === round.id)) {
    throw new Error("This lab round already has a recorded vote.");
  }

  const credentials = resolveCredentials(input.openrouterApiKey, input.useMock);
  session.mode = credentials.mode;
  if (credentials.event) session.events.push(credentials.event);

  const update =
    credentials.mode === "openrouter" && credentials.apiKey
      ? await updateSkillFromVote({
          session,
          round,
          winner,
          reason: input.reason,
          openrouterApiKey: credentials.apiKey,
        })
      : mockUpdateSkillFromVote({ session, round, winner, reason: input.reason });

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

  const nextRound = await generateRound({
    session,
    baselineSkill: update.updatedSkill,
    openrouterApiKey: credentials.apiKey,
  });
  session.rounds.push(nextRound);
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
  openrouterApiKey: string | null;
}): Promise<LabRound> {
  const roundIndex = input.session.rounds.length + 1;
  const roundId = randomId("round");
  const hypotheses =
    input.session.mode === "openrouter" && input.openrouterApiKey
      ? await generateHypotheses({
          session: input.session,
          baselineSkill: input.baselineSkill,
          openrouterApiKey: input.openrouterApiKey,
        })
      : mockHypotheses(input.baselineSkill, input.session.candidateCount, roundIndex);

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

  const candidates = await Promise.all(
    specs.map((spec, index) =>
      generateCandidate({
        session: input.session,
        spec,
        index,
        openrouterApiKey: input.openrouterApiKey,
      }),
    ),
  );

  return {
    id: roundId,
    index: roundIndex,
    taskPrompt: input.session.taskPrompt,
    baselineSkill: input.baselineSkill,
    hypotheses,
    candidates,
    createdAt: timestamp(),
  };
}

async function generateHypotheses(input: {
  session: LabSession;
  baselineSkill: string;
  openrouterApiKey: string;
}): Promise<LabHypothesis[]> {
  const result = await callOpenRouter({
    apiKey: input.openrouterApiKey,
    model: input.session.researcherModel,
    json: true,
    temperature: 0.9,
    maxTokens: 12000,
    messages: [
      {
        role: "system",
        content:
          "You optimize reusable design-generation skills through human preference experiments. Return strict JSON only.",
      },
      {
        role: "user",
        content: buildHypothesisPrompt(input.session, input.baselineSkill),
      },
    ],
  });
  const parsed = hypothesisSchema.parse(parseJsonObject<unknown>(result.text));
  const hypotheses = parsed.hypotheses.slice(0, input.session.candidateCount);
  if (hypotheses.length === 0) {
    return mockHypotheses(input.baselineSkill, input.session.candidateCount, input.session.rounds.length + 1);
  }
  return hypotheses.map((hypothesis, index) => ({
    id: `h${index + 1}`,
    title: hypothesis.title,
    rationale: hypothesis.rationale,
    changeSummary: hypothesis.changeSummary,
    variantSkill: hypothesis.variantSkill,
  }));
}

async function generateCandidate(input: {
  session: LabSession;
  spec: CandidateSpec;
  index: number;
  openrouterApiKey: string | null;
}): Promise<LabCandidate> {
  const generation =
    input.session.mode === "openrouter" && input.openrouterApiKey
      ? await generateHtmlWithOpenRouter({
          session: input.session,
          skill: input.spec.skill,
          openrouterApiKey: input.openrouterApiKey,
        })
      : {
          html: mockHtml({
            taskPrompt: input.session.taskPrompt,
            title: input.spec.title,
            index: input.index,
            skill: input.spec.skill,
          }),
          model: "mock",
          usage: null,
        };

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

async function generateHtmlWithOpenRouter(input: {
  session: LabSession;
  skill: string;
  openrouterApiKey: string;
}): Promise<{ html: string; model: string; usage: TokenUsage | null }> {
  const result = await callOpenRouter({
    apiKey: input.openrouterApiKey,
    model: input.session.generatorModel,
    temperature: 0.8,
    maxTokens: 9000,
    messages: [
      {
        role: "system",
        content: `You are a frontend design generator. Use the provided SKILL.md as the active design skill.

Return exactly one complete, self-contained HTML document. Do not use markdown fences. Do not fetch external scripts, fonts, images, or stylesheets. Use static HTML and CSS only. The output must render directly inside an iframe.

<skill>
${input.skill}
</skill>`,
      },
      {
        role: "user",
        content: input.session.taskPrompt,
      },
    ],
  });
  return {
    html: result.text,
    model: result.model,
    usage: result.usage,
  };
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
  const result = await callOpenRouter({
    apiKey: input.openrouterApiKey,
    model: input.session.researcherModel,
    json: true,
    temperature: 0.45,
    maxTokens: 12000,
    messages: [
      {
        role: "system",
        content:
          "You update a reusable design-generation skill from one blind human preference experiment. Return strict JSON only.",
      },
      {
        role: "user",
        content: buildSkillUpdatePrompt(input.session, input.round, input.winner, input.reason),
      },
    ],
  });
  const parsed = updateSchema.parse(parseJsonObject<unknown>(result.text));
  return {
    updatedSkill: parsed.updatedSkill,
    preferenceSummary: parsed.preferenceSummary,
    changeLog: parsed.changeLog,
    model: result.model,
    usage: result.usage,
  };
}

function buildHypothesisPrompt(session: LabSession, baselineSkill: string): string {
  return `Create exactly ${session.candidateCount} skill mutation hypotheses for the next preference round.

The test task is always:
${session.taskPrompt}

Each hypothesis must make a meaningful but bounded change to the skill. Good hypotheses include changing specificity, constraint ordering, anti-pattern emphasis, composition defaults, density rules, or how hard the skill pushes content neutrality. Avoid changing several unrelated things in one hypothesis.

Return JSON with this shape:
{
  "hypotheses": [
    {
      "title": "short label",
      "rationale": "why this might improve human preference",
      "changeSummary": "what changed relative to the baseline skill",
      "variantSkill": "the complete revised SKILL.md text"
    }
  ]
}

Preference history:
${preferenceHistory(session)}

Current baseline skill:
<skill>
${baselineSkill}
</skill>`;
}

function buildSkillUpdatePrompt(
  session: LabSession,
  round: LabRound,
  winner: LabCandidate,
  reason?: string,
): string {
  const candidates = round.candidates
    .map(
      (candidate) => `<candidate id="${candidate.id}" winner="${candidate.id === winner.id}">
Title: ${candidate.title}
Kind: ${candidate.kind}
Hypothesis: ${candidate.hypothesis}
Rationale: ${candidate.rationale}

Skill:
${truncateForPrompt(candidate.skill, 12000)}

Generated HTML sample:
${truncateForPrompt(candidate.html, 10000)}
</candidate>`,
    )
    .join("\n\n");

  return `A human selected the winning candidate for a design skill experiment.

Task prompt:
${round.taskPrompt}

Winner:
${winner.id} — ${winner.title}

Human note:
${reason?.trim() ? reason.trim() : "(none)"}

Preference history:
${preferenceHistory(session)}

Update the baseline skill for the next round. Do not simply copy the winner unless that is genuinely best. Infer what made the winner better than the rejected options, preserve useful baseline rules, and make a focused version-2 skill.

Return JSON with this shape:
{
  "updatedSkill": "complete updated SKILL.md text",
  "preferenceSummary": "one concise paragraph explaining the learning",
  "changeLog": ["specific skill changes made"]
}

Current baseline skill:
<baseline-skill>
${round.baselineSkill}
</baseline-skill>

Candidates:
${candidates}`;
}

function mockHypotheses(baseSkill: string, count: number, roundIndex: number): LabHypothesis[] {
  const patterns = [
    {
      title: "Sharper hierarchy",
      rationale: "Tests whether stronger typographic and spacing hierarchy makes outputs easier to scan.",
      changeSummary: "Adds stricter dashboard hierarchy, denser summaries, and clearer section rhythm.",
      addendum:
        "For dashboard-like tasks, prioritize one compact command row, clear metric hierarchy, and dense but calm tables over oversized hero sections.",
    },
    {
      title: "More concrete controls",
      rationale: "Tests whether granular component instructions reduce generic card-heavy output.",
      changeSummary: "Adds specific treatment for filters, tabs, rows, charts, and state controls.",
      addendum:
        "Render controls as working-looking UI: segmented filters, icon-sized buttons, compact tabs, visible sort states, and table rows with aligned numeric columns.",
    },
    {
      title: "Stronger restraint",
      rationale: "Tests whether stricter anti-decoration rules produce a quieter and more production-like interface.",
      changeSummary: "Increases pressure against decorative gradients, oversized cards, and one-note palettes.",
      addendum:
        "Do not let decoration carry the design. Use restrained contrast, local accent color, real data density, and small surface shifts instead.",
    },
    {
      title: "Layout specificity",
      rationale: "Tests whether explicit layout recipes make the model less likely to collapse into generic grids.",
      changeSummary: "Adds concrete layout defaults for sidebar, header, content bands, and responsive behavior.",
      addendum:
        "Use an app-like structure: fixed navigation, content toolbar, primary data region, secondary inspector, and responsive collapse rules.",
    },
  ];
  const fallbackPattern = patterns[0];
  if (!fallbackPattern) return [];

  return Array.from({ length: count }, (_, index) => {
    const pattern = patterns[index % patterns.length] ?? fallbackPattern;
    return {
      id: `h${index + 1}`,
      title: `${pattern.title} R${roundIndex}`,
      rationale: pattern.rationale,
      changeSummary: pattern.changeSummary,
      variantSkill: `${baseSkill.trim()}

## Lab hypothesis ${roundIndex}.${index + 1}: ${pattern.title}

${pattern.addendum}
`,
    };
  });
}

function mockUpdateSkillFromVote(input: {
  session: LabSession;
  round: LabRound;
  winner: LabCandidate;
  reason?: string | undefined;
}): {
  updatedSkill: string;
  preferenceSummary: string;
  changeLog: string[];
  model: string;
  usage: TokenUsage | null;
} {
  const note = input.reason?.trim() ? ` Human note: ${input.reason.trim()}` : "";
  const preferenceSummary = `Round ${input.round.index} preferred "${input.winner.title}" over the other candidates.${note}`;
  return {
    updatedSkill: `${input.winner.skill.trim()}

## Human preference learning

- ${preferenceSummary}
`,
    preferenceSummary,
    changeLog: [`Adopted the winning candidate direction: ${input.winner.hypothesis}`],
    model: "mock",
    usage: null,
  };
}

function mockHtml(input: {
  taskPrompt: string;
  title: string;
  index: number;
  skill: string;
}): string {
  const palettes = [
    { accent: "#2d7a4a", soft: "#e7efe9", second: "#315f96" },
    { accent: "#315f96", soft: "#e7edf5", second: "#8a5a2b" },
    { accent: "#8d4141", soft: "#f2e7e5", second: "#2d7a4a" },
    { accent: "#5e5a86", soft: "#eceaf4", second: "#87642f" },
  ];
  const fallbackPalette = palettes[0];
  if (!fallbackPalette) throw new Error("No mock palettes configured");
  const palette = palettes[input.index % palettes.length] ?? fallbackPalette;
  const density = input.skill.includes("dense") || input.skill.includes("density") ? "42px" : "52px";
  const radius = input.skill.includes("stricter") || input.skill.includes("restraint") ? "8px" : "12px";
  const task = escapeHtml(input.taskPrompt);
  const title = escapeHtml(input.title);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f6f6f2;
      color: #151513;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    .app { min-height: 100vh; display: grid; grid-template-columns: 220px 1fr; }
    nav { padding: 22px 18px; border-right: 1px solid #e0e0dc; background: #fbfbf8; }
    .brand { font-weight: 650; margin-bottom: 28px; }
    .navitem { height: 34px; display: flex; align-items: center; padding: 0 10px; border-radius: 8px; color: #60605b; font-size: 13px; }
    .navitem.active { color: #111; background: ${palette.soft}; }
    main { padding: 24px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
    h1 { margin: 0; font-size: 22px; letter-spacing: 0; }
    .sub { color: #6c6c66; font-size: 13px; margin-top: 4px; }
    .seg { display: inline-flex; background: #ecece8; padding: 3px; border-radius: 9px; }
    .seg span { height: 30px; padding: 0 12px; display: inline-flex; align-items: center; border-radius: 7px; font-size: 12px; color: #64645f; }
    .seg span:first-child { background: #fff; color: #111; box-shadow: 0 1px 8px rgba(0,0,0,.05); }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
    .metric, .panel { background: #fff; border: 1px solid #e7e7e2; border-radius: ${radius}; box-shadow: 0 8px 24px rgba(20,20,16,.04); }
    .metric { min-height: ${density}; padding: 13px 14px; }
    .label { color: #73736d; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    .value { margin-top: 7px; font-size: 24px; font-weight: 650; }
    .delta { color: ${palette.accent}; font-size: 12px; margin-top: 2px; }
    .grid { display: grid; grid-template-columns: 1.4fr .75fr; gap: 12px; }
    .panel { padding: 16px; min-height: 280px; }
    .panelhead { display:flex; align-items:center; justify-content:space-between; margin-bottom: 14px; }
    h2 { margin:0; font-size: 14px; }
    .chip { font-size: 12px; color: ${palette.accent}; background: ${palette.soft}; border-radius: 999px; padding: 5px 9px; }
    .chart { height: 168px; display:flex; align-items:end; gap: 8px; border-bottom: 1px solid #e8e8e3; padding-top: 16px; }
    .bar { flex: 1; border-radius: 6px 6px 0 0; background: linear-gradient(180deg, ${palette.accent}, ${palette.second}); opacity:.88; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    td { padding: 10px 0; border-bottom: 1px solid #ecece8; }
    td:last-child { text-align:right; font-variant-numeric: tabular-nums; }
    .status { display:inline-flex; width:8px; height:8px; border-radius:50%; background:${palette.accent}; margin-right:8px; }
    @media (max-width: 760px) {
      .app { grid-template-columns: 1fr; }
      nav { display: none; }
      main { padding: 16px; }
      header, .grid { display: block; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .panel { margin-top: 12px; }
    }
  </style>
</head>
<body>
  <div class="app">
    <nav>
      <div class="brand">Northstar</div>
      <div class="navitem active">Overview</div>
      <div class="navitem">Revenue</div>
      <div class="navitem">Accounts</div>
      <div class="navitem">Reports</div>
    </nav>
    <main>
      <header>
        <div>
          <h1>${task}</h1>
          <div class="sub">${title} · static MVP render</div>
        </div>
        <div class="seg"><span>Week</span><span>Month</span><span>Year</span></div>
      </header>
      <section class="metrics">
        <div class="metric"><div class="label">Revenue</div><div class="value">$428k</div><div class="delta">+12.4%</div></div>
        <div class="metric"><div class="label">Pipeline</div><div class="value">$1.8m</div><div class="delta">+6.1%</div></div>
        <div class="metric"><div class="label">Activation</div><div class="value">64%</div><div class="delta">+3.8%</div></div>
        <div class="metric"><div class="label">Risk</div><div class="value">18</div><div class="delta">-4 open</div></div>
      </section>
      <section class="grid">
        <div class="panel">
          <div class="panelhead"><h2>Performance trend</h2><span class="chip">Live</span></div>
          <div class="chart">
            <div class="bar" style="height:42%"></div><div class="bar" style="height:58%"></div><div class="bar" style="height:47%"></div><div class="bar" style="height:72%"></div><div class="bar" style="height:66%"></div><div class="bar" style="height:88%"></div><div class="bar" style="height:76%"></div>
          </div>
        </div>
        <div class="panel">
          <div class="panelhead"><h2>Priority accounts</h2><span class="chip">12</span></div>
          <table>
            <tr><td><span class="status"></span>Atlas Co</td><td>$92k</td></tr>
            <tr><td><span class="status"></span>Meridian</td><td>$74k</td></tr>
            <tr><td><span class="status"></span>Fieldstone</td><td>$51k</td></tr>
            <tr><td><span class="status"></span>Luma Works</td><td>$36k</td></tr>
          </table>
        </div>
      </section>
    </main>
  </div>
</body>
</html>`;
}

function normalizeHtml(text: string): string {
  const trimmed = text
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (/^<!doctype html>/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) return trimmed;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Generated candidate</title>
</head>
<body>${trimmed}</body>
</html>`;
}

function resolveCredentials(openrouterApiKey: string | undefined, useMock: boolean): LabCredentials {
  const apiKey = openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim() || "";
  if (useMock) {
    return { mode: "mock", apiKey: null, event: "Using deterministic mock model mode." };
  }
  if (!apiKey) {
    return {
      mode: "mock",
      apiKey: null,
      event: "No OpenRouter key was provided, so the lab used mock model mode.",
    };
  }
  return { mode: "openrouter", apiKey, event: "Using OpenRouter model calls." };
}

function toSessionResponse(session: LabSession): LabApiSessionResponse {
  const activeRound = session.rounds[session.rounds.length - 1];
  if (!activeRound) throw new Error("Lab session has no active round.");
  return { session, activeRound };
}

function preferenceHistory(session: LabSession): string {
  if (session.votes.length === 0) return "(none yet)";
  return session.votes
    .map((vote, index) => `${index + 1}. ${vote.preferenceSummary}`)
    .join("\n");
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
