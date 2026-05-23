"use client";

import { useCallback, useEffect, useState } from "react";

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
                <OpenRouterGlyph /> Connect OpenRouter
              </>
            )}
          </button>
          {/* Secondary CTA for technical visitors: clone the repo and run
             the pipeline locally with direct provider keys. Sits next to
             the OAuth button as a peer because for that audience it's the
             real alternative — not a downgrade. GitHub glyph signals the
             destination without needing extra label text. */}
          <a
            className="btn btn--quiet"
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <GithubGlyph /> Clone and try locally
          </a>
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

function GithubGlyph() {
  // Duplicated from Shell.tsx rather than extracted into a shared module
  // because it's still only used in two places. Promote to a shared
  // _components/glyphs.tsx if a third usage appears.
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
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
