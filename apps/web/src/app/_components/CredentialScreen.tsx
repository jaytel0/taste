"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearCredentials,
  connectManualCredentials,
  createOpenRouterConnectUrl,
  describeError,
  fetchCredentialStatus,
  type CredentialStatus,
} from "../_lib/api";

type CredentialScreenProps = {
  initialStatus: CredentialStatus;
  onConnected: (status: CredentialStatus) => void;
  initialError?: string | null;
};

export function CredentialScreen({
  initialStatus,
  onConnected,
  initialError,
}: CredentialScreenProps) {
  const [status, setStatus] = useState<CredentialStatus>(initialStatus);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState<null | "openrouter" | "direct" | "disconnect">(
    null,
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Direct OpenAI + Anthropic
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");

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

  const submitDirect = useCallback(async () => {
    setError(null);
    const openai = openaiKey.trim();
    const anthropic = anthropicKey.trim();
    if (!openai || !anthropic) {
      setError("Both an OpenAI key and an Anthropic key are required.");
      return;
    }
    setBusy("direct");
    try {
      const next = await connectManualCredentials({
        mode: "direct",
        openaiApiKey: openai,
        anthropicApiKey: anthropic,
      });
      setOpenaiKey("");
      setAnthropicKey("");
      setStatus(next);
    } catch (err) {
      setError(describeError(err, "Could not save those API keys."));
      setBusy(null);
    }
  }, [anthropicKey, openaiKey]);

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
    <section className="card card--lift">
      <h1 className="card__title">Bring your own model access.</h1>
      <p className="card__sub">
        This demo requires two models. The simplest way is to use OpenRouter. Your API key never
        touches this device — it stays in an encrypted server session.
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
      </div>

      {error && <p className="notice">{error}</p>}

      <div className="card__section card__section--tight">
        <button
          type="button"
          className="disclose"
          aria-expanded={advancedOpen}
          aria-controls="advanced-panel"
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          <span>Use direct provider keys instead</span>
          <ChevronGlyph />
        </button>
      </div>

      <div
        id="advanced-panel"
        role="region"
        aria-label="Direct provider keys"
        className={`accordion${advancedOpen ? " accordion--open" : ""}`}
        aria-hidden={!advancedOpen}
      >
        <div className="accordion__inner">
          <div className="accordion__content">
            <ManualKeyForm
              // Key on advancedOpen so the form remounts on each expand,
              // clearing any previously typed (but unsubmitted) secret and
              // re-firing the autofocus into the first input.
              key={advancedOpen ? "open" : "closed"}
              disabled={busy !== null}
              fields={[
                {
                  id: "openai-key",
                  label: "OpenAI API key",
                  placeholder: "sk-...",
                  value: openaiKey,
                  onChange: setOpenaiKey,
                  autoFocus: true,
                  required: true,
                },
                {
                  id: "anthropic-key",
                  label: "Anthropic API key",
                  placeholder: "sk-ant-...",
                  value: anthropicKey,
                  onChange: setAnthropicKey,
                  required: true,
                },
              ]}
              submitLabel="Use these keys"
              submitting={busy === "direct"}
              onSubmit={() => void submitDirect()}
              hint="Both keys are required. They are stored server-side for this session and never displayed back."
            />
          </div>
        </div>
      </div>
    </section>
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

type ManualField = {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
  autoFocus?: boolean;
  required?: boolean;
};

function ManualKeyForm({
  fields,
  submitLabel,
  submitting,
  disabled,
  onSubmit,
  hint,
}: {
  fields: ManualField[];
  submitLabel: string;
  submitting: boolean;
  disabled: boolean;
  onSubmit: () => void;
  hint: string;
}) {
  const firstFocusRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstFocusRef.current?.focus();
  }, []);

  return (
    <form
      className="manualform"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onSubmit();
      }}
    >
      {fields.map((field, index) => (
        <label className="field" htmlFor={field.id} key={field.id}>
          <span className="field__label">{field.label}</span>
          <input
            ref={index === 0 ? firstFocusRef : undefined}
            id={field.id}
            type="password"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            className="input input--mono"
            placeholder={field.placeholder}
            value={field.value}
            onChange={(event) => field.onChange(event.target.value)}
            disabled={disabled}
            required={field.required}
          />
        </label>
      ))}
      <p className="field__hint manualform__hint">{hint}</p>
      <div className="btn-row">
        <button type="submit" className="btn btn--primary" disabled={disabled}>
          {submitting ? (
            <>
              <span className="spinner" /> Saving
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </form>
  );
}

function modeTitle(status: CredentialStatus): string {
  if (status.mode === "openrouter") return "OpenRouter is connected.";
  if (status.mode === "direct") return "Direct API keys connected.";
  return "Connected.";
}

function modeSub(status: CredentialStatus): string {
  const label = status.label ? ` · ${status.label}` : "";
  if (status.mode === "openrouter") {
    return `Signed in via OpenRouter${label}.`;
  }
  if (status.mode === "direct") {
    return `OpenAI + Anthropic keys saved to this session${label}.`;
  }
  return "Ready to create a run.";
}

function ChevronGlyph() {
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
      <polyline points="6 9 12 15 18 9" />
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
