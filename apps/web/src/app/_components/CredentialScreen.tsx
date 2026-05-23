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
          {/* Lets a visitor preview the actual output of the pipeline before
             committing to the OAuth handshake. The zip mirrors the Claude
             Skills on-disk convention: <skill-name>/SKILL.md inside the
             archive, with the folder name matching the skill's YAML `name`.
             Bundle is rebuilt from pipeline/taste/taste-skill/SKILL.md by
             scripts/build-example-skill.sh on every web build. */}
          <a
            className="btn btn--quiet"
            href="/taste-design.zip"
            download
          >
            Try the taste skill example
          </a>
        </div>

        {error && <p className="notice">{error}</p>}

        <p className="local-note">
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Try this yourself locally.
          </a>
        </p>
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
