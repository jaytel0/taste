"use client";

import { useCallback, useMemo, useState } from "react";

import {
  DEFAULT_GENERATOR_MODEL,
  DEFAULT_RESEARCHER_MODEL,
  DEFAULT_TASK_PROMPT,
} from "@/lab/defaults";
import type { LabApiSessionResponse, LabCandidate, LabRound, LabSession, LabVote } from "@/lab/types";

type SkillLabClientProps = {
  defaultSkill: string;
};

type StartRequest = {
  baseSkill: string;
  taskPrompt: string;
  generatorModel: string;
  researcherModel: string;
  candidateCount: number;
  openrouterApiKey?: string | undefined;
  useMock: boolean;
};

type VoteRequest = {
  sessionId: string;
  roundId: string;
  winnerCandidateId: string;
  reason?: string | undefined;
  openrouterApiKey?: string | undefined;
  useMock: boolean;
};

export function SkillLabClient({ defaultSkill }: SkillLabClientProps) {
  const [baseSkill, setBaseSkill] = useState(defaultSkill);
  const [taskPrompt, setTaskPrompt] = useState(DEFAULT_TASK_PROMPT);
  const [generatorModel, setGeneratorModel] = useState(DEFAULT_GENERATOR_MODEL);
  const [researcherModel, setResearcherModel] = useState(DEFAULT_RESEARCHER_MODEL);
  const [candidateCount, setCandidateCount] = useState(3);
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [useMock, setUseMock] = useState(true);
  const [sessionIdToLoad, setSessionIdToLoad] = useState("");
  const [response, setResponse] = useState<LabApiSessionResponse | null>(null);
  const [reason, setReason] = useState("");
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeRound = response?.activeRound ?? null;
  const session = response?.session ?? null;
  const hasRealKey = openrouterApiKey.trim().length > 0;
  const canUseOpenRouter = hasRealKey || !useMock;

  const start = useCallback(async () => {
    setError(null);
    setLoadingLabel("Generating baseline and hypotheses");
    try {
      const body: StartRequest = {
        baseSkill,
        taskPrompt,
        generatorModel,
        researcherModel,
        candidateCount,
        openrouterApiKey,
        useMock,
      };
      setResponse(await postJson<LabApiSessionResponse>("/api/lab/start", body));
      setReason("");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoadingLabel(null);
    }
  }, [
    baseSkill,
    candidateCount,
    generatorModel,
    openrouterApiKey,
    researcherModel,
    taskPrompt,
    useMock,
  ]);

  const vote = useCallback(
    async (candidate: LabCandidate) => {
      if (!session || !activeRound) return;
      setError(null);
      setLoadingLabel(`Recording preference for ${candidate.title}`);
      try {
        const body: VoteRequest = {
          sessionId: session.id,
          roundId: activeRound.id,
          winnerCandidateId: candidate.id,
          reason,
          openrouterApiKey,
          useMock,
        };
        setResponse(await postJson<LabApiSessionResponse>("/api/lab/vote", body));
        setReason("");
      } catch (err) {
        setError(describeError(err));
      } finally {
        setLoadingLabel(null);
      }
    },
    [activeRound, openrouterApiKey, reason, session, useMock],
  );

  const loadSession = useCallback(async () => {
    const trimmed = sessionIdToLoad.trim();
    if (!trimmed) return;
    setError(null);
    setLoadingLabel("Loading local session");
    try {
      setResponse(await getJson<LabApiSessionResponse>(`/api/lab/sessions/${encodeURIComponent(trimmed)}`));
      setReason("");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoadingLabel(null);
    }
  }, [sessionIdToLoad]);

  const currentSkill = session?.currentSkill ?? baseSkill;
  const currentRoundLabel = activeRound ? `Round ${activeRound.index}` : "No active round";
  const history = useMemo<LabVote[]>(() => (session ? [...session.votes].reverse() : []), [session]);

  return (
    <main className="lab-shell">
      <header className="lab-hero">
        <div>
          <a className="lab-back" href="/">
            Taste
          </a>
          <h1>Skill Lab</h1>
          <p>
            Run an autoresearch-style loop over a generated design skill. The metric is
            human preference: pick the better iframe, then generate the next baseline.
          </p>
        </div>
        <div className="lab-status" aria-label="Current lab status">
          <span>{session?.mode ?? (useMock ? "mock" : "openrouter")}</span>
          <strong>{currentRoundLabel}</strong>
        </div>
      </header>

      <section className="lab-grid">
        <aside className="lab-panel lab-panel--setup">
          <div className="lab-section-title">
            <h2>Setup</h2>
            <span>{canUseOpenRouter ? "ready" : "mock-ready"}</span>
          </div>

          <label className="field">
            <span className="field__label">Task prompt</span>
            <input
              className="input"
              value={taskPrompt}
              onChange={(event) => setTaskPrompt(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field__label">OpenRouter key</span>
            <input
              className="input input--mono"
              type="password"
              value={openrouterApiKey}
              placeholder="Optional. Uses mock mode without a key."
              onChange={(event) => setOpenrouterApiKey(event.target.value)}
            />
          </label>

          <label className="lab-toggle">
            <input
              type="checkbox"
              checked={useMock}
              onChange={(event) => setUseMock(event.target.checked)}
            />
            <span>Use mock models</span>
          </label>

          <div className="lab-two">
            <label className="field">
              <span className="field__label">Generator</span>
              <input
                className="input input--mono"
                value={generatorModel}
                onChange={(event) => setGeneratorModel(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Researcher</span>
              <input
                className="input input--mono"
                value={researcherModel}
                onChange={(event) => setResearcherModel(event.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span className="field__label">Variant count</span>
            <input
              className="input"
              type="number"
              min={1}
              max={4}
              value={candidateCount}
              onChange={(event) => setCandidateCount(Number(event.target.value))}
            />
          </label>

          <label className="field">
            <span className="field__label">Base SKILL.md</span>
            <textarea
              className="lab-textarea lab-textarea--skill"
              value={baseSkill}
              onChange={(event) => setBaseSkill(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="btn btn--primary lab-full"
            onClick={() => void start()}
            disabled={Boolean(loadingLabel) || baseSkill.trim().length < 20}
          >
            Start lab round
          </button>

          <div className="lab-load">
            <input
              className="input input--mono"
              placeholder="Load session id"
              value={sessionIdToLoad}
              onChange={(event) => setSessionIdToLoad(event.target.value)}
            />
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => void loadSession()}
              disabled={Boolean(loadingLabel) || !sessionIdToLoad.trim()}
            >
              Load
            </button>
          </div>
        </aside>

        <section className="lab-workspace">
          {loadingLabel && (
            <div className="lab-notice">
              <span className="spinner" /> {loadingLabel}. This can take a while with real model calls.
            </div>
          )}

          {error && <div className="lab-error">{error}</div>}

          {session && activeRound ? (
            <>
              <RoundHeader session={session} round={activeRound} />
              <label className="field lab-reason">
                <span className="field__label">Preference note</span>
                <input
                  className="input"
                  value={reason}
                  placeholder="Optional: why the winning iframe is better."
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <div className="lab-candidates">
                {activeRound.candidates.map((candidate) => (
                  <CandidateFrame
                    key={candidate.id}
                    candidate={candidate}
                    disabled={Boolean(loadingLabel)}
                    onVote={vote}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="lab-empty">
              <h2>No round yet</h2>
              <p>
                Start with the checked-in skill, mock mode, and the default dashboard prompt to
                verify the loop locally. Add an OpenRouter key and turn off mock mode for real
                Claude Opus 4.7 candidate generation.
              </p>
            </div>
          )}
        </section>
      </section>

      {session && (
        <section className="lab-bottom">
          <div className="lab-panel">
            <div className="lab-section-title">
              <h2>Current baseline skill</h2>
              <span>{currentSkill.length.toLocaleString()} chars</span>
            </div>
            <pre className="lab-skill-preview">{currentSkill}</pre>
          </div>

          <div className="lab-panel">
            <div className="lab-section-title">
              <h2>Preference history</h2>
              <span>{session.votes.length} votes</span>
            </div>
            {history.length > 0 ? (
              <div className="lab-history">
                {history.map((vote) => (
                  <article key={vote.id}>
                    <strong>{vote.preferenceSummary}</strong>
                    {vote.changeLog.length > 0 && <p>{vote.changeLog.join(" ")}</p>}
                  </article>
                ))}
              </div>
            ) : (
              <p className="lab-muted">No human selections recorded yet.</p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function RoundHeader({ session, round }: { session: LabSession; round: LabRound }) {
  return (
    <div className="lab-round-head">
      <div>
        <span className="lab-eyebrow">{session.id}</span>
        <h2>Round {round.index}: pick the best result</h2>
        <p>{round.taskPrompt}</p>
      </div>
      <div className="lab-models">
        <span>{session.generatorModel}</span>
        <span>{session.researcherModel}</span>
      </div>
    </div>
  );
}

function CandidateFrame({
  candidate,
  disabled,
  onVote,
}: {
  candidate: LabCandidate;
  disabled: boolean;
  onVote: (candidate: LabCandidate) => Promise<void>;
}) {
  return (
    <article className="lab-candidate">
      <div className="lab-candidate__head">
        <div>
          <span>{candidate.kind}</span>
          <h3>{candidate.title}</h3>
        </div>
        <button
          type="button"
          className="btn btn--quiet btn--sm"
          disabled={disabled}
          onClick={() => void onVote(candidate)}
        >
          Pick this
        </button>
      </div>
      <iframe
        className="lab-frame"
        title={candidate.title}
        sandbox=""
        srcDoc={candidate.html}
      />
      <details className="lab-candidate__details">
        <summary>Hypothesis</summary>
        <p>{candidate.hypothesis}</p>
        <p>{candidate.rationale}</p>
        <span>{candidate.model}</span>
      </details>
    </article>
  );
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJsonResponse<T>(response);
}

async function getJson<T>(url: string): Promise<T> {
  return readJsonResponse<T>(await fetch(url));
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    if (data && typeof data === "object") {
      const error = (data as Record<string, unknown>).error;
      if (error && typeof error === "object") {
        const message = (error as Record<string, unknown>).message;
        if (typeof message === "string") throw new Error(message);
      }
      const message = (data as Record<string, unknown>).error;
      if (typeof message === "string") throw new Error(message);
    }
    throw new Error(`Request failed with status ${response.status}.`);
  }
  return data as T;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
