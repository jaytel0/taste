export type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type LabHypothesis = {
  id: string;
  title: string;
  rationale: string;
  changeSummary: string;
  variantSkill: string;
};

export type LabCandidate = {
  id: string;
  kind: "baseline" | "variant";
  title: string;
  hypothesis: string;
  rationale: string;
  skill: string;
  html: string;
  model: string;
  usage: TokenUsage | null;
  createdAt: string;
};

export type LabRound = {
  id: string;
  index: number;
  taskPrompt: string;
  baselineSkill: string;
  hypotheses: LabHypothesis[];
  candidates: LabCandidate[];
  createdAt: string;
};

export type LabVote = {
  id: string;
  roundId: string;
  winnerCandidateId: string;
  reason: string | null;
  selectedAt: string;
  updatedSkill: string;
  changeLog: string[];
  preferenceSummary: string;
  model: string;
  usage: TokenUsage | null;
};

export type LabSession = {
  id: string;
  mode: "openrouter";
  taskPrompt: string;
  generatorModel: string;
  researcherModel: string;
  candidateCount: number;
  sourceRuleSet: string;
  initialSkill: string;
  currentSkill: string;
  rounds: LabRound[];
  votes: LabVote[];
  events: string[];
  createdAt: string;
  updatedAt: string;
};

export type LabApiSessionResponse = {
  session: LabSession;
  activeRound: LabRound;
};
