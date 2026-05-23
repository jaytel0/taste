"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearCredentials,
  createOpenRouterConnectUrl,
  describeError,
  fetchCredentialStatus,
  type CredentialStatus,
} from "../_lib/api";
import { PastGenerations } from "./PastGenerations";

type CredentialScreenProps = {
  initialStatus: CredentialStatus;
  onConnected: (status: CredentialStatus) => void;
  initialError?: string | null;
};

const SOURCE_URL = "https://github.com/jaytel0/taste";

// Single instruction blob the visitor hands to their coding agent. Written
// as a natural-language directive (not a command-line snippet) because the
// audience is "paste this into Claude/Cursor/Codex", not a shell. We name
// the repo URL explicitly so the agent doesn't have to guess.
const CLONE_PROMPT = `Clone ${SOURCE_URL} and get it set up locally so I can start running the pipeline and creating a skill. Let me know what information and API keys you need from me.`;

export function CredentialScreen({
  initialStatus,
  onConnected,
  initialError,
}: CredentialScreenProps) {
  const [status, setStatus] = useState<CredentialStatus>(initialStatus);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState<null | "openrouter" | "disconnect">(null);

  // If the user comes back connected (URL param case is handled upstream),
  // bubble that out so the create screen takes over.
  useEffect(() => {
    if (status.connected) onConnected(status);
  }, [status, onConnected]);

  const connectOpenRouter = useCallback(async () => {
    setError(null);
    setBusy("openrouter");
    try {
      const url = await createOpenRouterConnectUrl("/");
      // Full-page navigation so the OAuth state cookie roundtrips correctly.
      window.location.href = url;
    } catch (err) {
      setError(describeError(err, "Could not start OpenRouter sign-in."));
      setBusy(null);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    setBusy("disconnect");
    try {
      await clearCredentials();
      const next = await fetchCredentialStatus();
      setStatus(next);
      setBusy(null);
    } catch (err) {
      setError(describeError(err, "Could not disconnect."));
      setBusy(null);
    }
  }, []);

  // Connected — render the connected card. The parent will route forward on
  // its own when it sees a connected status, but we still render here in case
  // the user opens the credential screen via the footer to switch accounts.
  if (status.connected) {
    return (
      <ConnectedCard
        status={status}
        busy={busy}
        onDisconnect={() => void disconnect()}
        onContinue={() => onConnected(status)}
      />
    );
  }

  return (
    <>
      <section className="card card--lift">
        <h1 className="card__title">Turn reference images into a taste skill.</h1>
        <p className="card__sub">
          A pipeline that distills a corpus of reference images into a single reusable SKILL.md.
        </p>

        <div className="card__section btn-row">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void connectOpenRouter()}
            disabled={busy !== null}
          >
            {busy === "openrouter" ? (
              <>
                <span className="spinner" /> Redirecting
              </>
            ) : (
              <>
                <OpenRouterGlyph /> Try with OpenRouter
              </>
            )}
          </button>
          {/* Secondary CTA for technical visitors: hand a ready-made
             instruction to their coding agent instead of sending them off
             to GitHub to figure out the steps themselves. The label
             cycles idle → copied → prompt so the visitor knows what to do
             next without us writing a paragraph of help text. */}
          <CloneAgentButton prompt={CLONE_PROMPT} />
        </div>

        {error && <p className="notice">{error}</p>}
      </section>
      <PastGenerations />
    </>
  );
}

function ConnectedCard({
  status,
  busy,
  onDisconnect,
  onContinue,
}: {
  status: CredentialStatus;
  busy: string | null;
  onDisconnect: () => void;
  onContinue: () => void;
}) {
  return (
    <section className="card card--lift">
      <h1 className="card__title">{modeTitle(status)}</h1>
      <p className="card__sub">{modeSub(status)}</p>

      <div className="card__section btn-row">
        <button type="button" className="btn btn--primary" onClick={onContinue}>
          Continue
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onDisconnect}
          disabled={busy !== null}
        >
          {busy === "disconnect" ? (
            <>
              <span className="spinner" /> Disconnecting
            </>
          ) : (
            "Disconnect"
          )}
        </button>
      </div>
    </section>
  );
}

function modeTitle(status: CredentialStatus): string {
  if (status.mode === "openrouter") return "OpenRouter is connected.";
  return "Connected.";
}

function modeSub(status: CredentialStatus): string {
  const label = status.label ? ` · ${status.label}` : "";
  if (status.mode === "openrouter") {
    return `Signed in via OpenRouter${label}.`;
  }
  return "Ready to create a run.";
}

type CopyState = "idle" | "copied" | "prompt";

const COPY_LABELS: Record<CopyState, string> = {
  idle: "Clone and try locally",
  copied: "Copied!",
  prompt: "Paste to your agent.",
};

const COPY_ORDER: readonly CopyState[] = ["idle", "copied", "prompt"];

// Timings tuned per Emil Kowalski's playbook: each crossfade is well under
// 300ms (label transition is 220ms with a 120ms lead-out delay on the
// outgoing label — see globals.css). The hold durations are intentionally
// uneven: "Copied!" is the receipt and should feel like a flash (900ms),
// "Paste to your agent." is an instruction and needs time to read (2200ms).
const COPIED_HOLD_MS = 900;
const PROMPT_HOLD_MS = 2200;

function CloneAgentButton({ prompt }: { prompt: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const [failed, setFailed] = useState(false);
  // Track pending timers so a second click while mid-cycle restarts
  // cleanly instead of stacking transitions on top of each other.
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  const handleClick = useCallback(async () => {
    clearTimers();
    setFailed(false);
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // Clipboard can be denied (e.g. insecure context). Fall back to a
      // textarea + execCommand so the affordance still works.
      const ok = legacyCopy(prompt);
      if (!ok) {
        setFailed(true);
        return;
      }
    }
    setState("copied");
    timersRef.current.push(
      window.setTimeout(() => setState("prompt"), COPIED_HOLD_MS),
    );
    timersRef.current.push(
      window.setTimeout(
        () => setState("idle"),
        COPIED_HOLD_MS + PROMPT_HOLD_MS,
      ),
    );
  }, [prompt]);

  return (
    <button
      type="button"
      className="btn btn--quiet btn--copy"
      onClick={() => void handleClick()}
      data-state={state}
      aria-live="polite"
    >
      {/* CSS grid stack: every label lives in the same grid cell, so the
         button width is pinned to the widest label and never reflows.
         Only the inactive labels are transformed/blurred — width and
         layout stay rock-steady through the entire cycle. */}
      <span className="btn-copy__stack">
        {COPY_ORDER.map((s) => (
          <span
            key={s}
            className="btn-copy__label"
            data-active={s === state}
            aria-hidden={s === state ? undefined : true}
          >
            {failed && s === "idle" ? "Copy failed — try again" : COPY_LABELS[s]}
          </span>
        ))}
      </span>
    </button>
  );
}

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function OpenRouterGlyph() {
  // A small neutral mark — not a brand impersonation. Just a quiet ring with
  // a single inset dot so the primary button has a glyph that hints at
  // "connect / external link" without introducing extra color.
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M9 12h6" />
      <path d="M13 9l3 3-3 3" />
    </svg>
  );
}
