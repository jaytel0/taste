"use client";

import { useCallback, useEffect, useState } from "react";

import { CreateScreen } from "./_components/CreateScreen";
import { CredentialScreen } from "./_components/CredentialScreen";
import { ProcessingScreen } from "./_components/ProcessingScreen";
import { Shell } from "./_components/Shell";
import { SkillScreen } from "./_components/SkillScreen";
import { UploadScreen } from "./_components/UploadScreen";
import {
  ApiError,
  clearCredentials,
  describeError,
  fetchCredentialStatus,
  fetchRunStatus,
  isTerminal,
  type CreateRunResponse,
  type CredentialStatus,
  type RunCredentials,
  type RunStatus,
} from "./_lib/api";
import { clearStoredRun, loadStoredRun, saveStoredRun } from "./_lib/storage";

type Phase =
  | { kind: "boot" }
  | { kind: "credentials"; initialError?: string }
  | { kind: "create" }
  | { kind: "uploading"; creds: RunCredentials; files: File[] }
  | { kind: "processing"; creds: RunCredentials; initialStatus?: RunStatus }
  | { kind: "complete"; creds: RunCredentials }
  | { kind: "resume_error"; creds: RunCredentials; message: string };

export default function Page() {
  const [phase, setPhase] = useState<Phase>({ kind: "boot" });
  const [credentials, setCredentials] = useState<CredentialStatus | null>(null);

  // Boot: consume any OAuth-return URL params, fetch credential status, then
  // either restore an active run or show the create / credentials screen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const oauthFlag = readAndStripCredentialFlag();

      let status: CredentialStatus;
      try {
        status = await fetchCredentialStatus();
      } catch {
        status = emptyCredentialStatus();
      }
      if (cancelled) return;
      setCredentials(status);

      if (!status.connected) {
        setPhase({
          kind: "credentials",
          ...(oauthFlag === "failed"
            ? { initialError: "OpenRouter sign-in did not complete. Try again or use direct provider keys." }
            : {}),
        });
        return;
      }

      const stored = loadStoredRun();
      if (!stored) {
        setPhase({ kind: "create" });
        return;
      }
      const resumed = await resumeStored(stored);
      if (!cancelled) setPhase(resumed);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCredentialsConnected = useCallback((status: CredentialStatus) => {
    setCredentials(status);
    // After connecting, drop into create unless the user already has an
    // active run stored (e.g. they reconnected without disconnecting first).
    setPhase((current) => {
      if (current.kind !== "credentials" && current.kind !== "boot") return current;
      const stored = loadStoredRun();
      if (!stored) return { kind: "create" };
      // Defer to the boot-style resume so a mid-flight run picks up where it
      // left off.
      return { kind: "boot" };
    });
    const stored = loadStoredRun();
    if (stored) void resumeStored(stored).then(setPhase);
  }, []);

  const handleCreated = useCallback((response: CreateRunResponse, files: File[]) => {
    const creds: RunCredentials = {
      runId: response.runId,
      runSecret: response.runSecret,
    };
    saveStoredRun(creds);
    setPhase({ kind: "uploading", creds, files });
  }, []);

  const handleUploadsDone = useCallback(() => {
    setPhase((current) =>
      current.kind === "uploading" ? { kind: "processing", creds: current.creds } : current,
    );
  }, []);

  const handleProcessingComplete = useCallback(() => {
    setPhase((current) =>
      current.kind === "processing" ? { kind: "complete", creds: current.creds } : current,
    );
  }, []);

  const clearRun = useCallback(() => {
    clearStoredRun();
    setPhase({ kind: "create" });
  }, []);

  const switchCredentials = useCallback(async () => {
    clearStoredRun();
    try {
      await clearCredentials();
    } catch {
      /* best effort */
    }
    setCredentials(emptyCredentialStatus());
    setPhase({ kind: "credentials" });
  }, []);

  const retryResume = useCallback(() => {
    const stored = loadStoredRun();
    if (!stored) {
      setPhase({ kind: "create" });
      return;
    }
    setPhase({ kind: "boot" });
    void resumeStored(stored).then(setPhase);
  }, []);

  const activeRunId = "creds" in phase ? phase.creds.runId : undefined;
  const showClear = phase.kind !== "create" && phase.kind !== "boot" && phase.kind !== "credentials";
  const showDisconnect =
    phase.kind !== "boot" && phase.kind !== "credentials" && credentials?.connected === true;

  return (
    <Shell
      onClear={showClear ? clearRun : undefined}
      onDisconnect={showDisconnect ? switchCredentials : undefined}
      runId={activeRunId}
      credentials={phase.kind === "boot" || phase.kind === "credentials" ? null : credentials}
    >
      {phase.kind === "boot" && <BootCard />}
      {phase.kind === "credentials" && (
        <CredentialScreen
          initialStatus={credentials ?? emptyCredentialStatus()}
          initialError={phase.initialError ?? null}
          onConnected={handleCredentialsConnected}
        />
      )}
      {phase.kind === "create" && credentials?.connected && (
        <CreateScreen credentials={credentials} onCreated={handleCreated} />
      )}
      {phase.kind === "uploading" && (
        <UploadScreen
          creds={phase.creds}
          files={phase.files}
          onComplete={handleUploadsDone}
          onAbandon={clearRun}
        />
      )}
      {phase.kind === "processing" && (
        <ProcessingScreen
          creds={phase.creds}
          initialStatus={phase.initialStatus}
          onComplete={handleProcessingComplete}
          onAbandon={clearRun}
        />
      )}
      {phase.kind === "complete" && (
        <SkillScreen creds={phase.creds} onStartAnother={clearRun} />
      )}
      {phase.kind === "resume_error" && (
        <ResumeErrorCard message={phase.message} onRetry={retryResume} onClear={clearRun} />
      )}
    </Shell>
  );
}

async function resumeStored(creds: RunCredentials): Promise<Phase> {
  try {
    const status = await fetchRunStatus(creds);
    if (status.status === "complete" && status.artifacts.skillReady) {
      return { kind: "complete", creds };
    }
    if (status.status === "uploading") {
      clearStoredRun();
      return { kind: "create" };
    }
    return { kind: "processing", creds, initialStatus: status };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      clearStoredRun();
      return { kind: "create" };
    }
    return {
      kind: "resume_error",
      creds,
      message: describeError(err, "Could not resume the run."),
    };
  }
}

function readAndStripCredentialFlag(): "connected" | "failed" | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const flag = url.searchParams.get("credentials");
  if (!flag) return null;
  url.searchParams.delete("credentials");
  window.history.replaceState({}, "", url.toString());
  if (flag === "openrouter_connected") return "connected";
  if (flag === "openrouter_failed") return "failed";
  return null;
}

function emptyCredentialStatus(): CredentialStatus {
  return {
    connected: false,
    mode: null,
    source: null,
    label: null,
    connectedAt: null,
    expiresAt: null,
    providers: [],
  };
}

function BootCard() {
  return (
    <section className="card">
      <h1 className="card__title">
        <span className="spinner" /> Restoring session
      </h1>
      <p className="card__sub">Checking for an active pipeline run.</p>
    </section>
  );
}

function ResumeErrorCard({
  message,
  onRetry,
  onClear,
}: {
  message: string;
  onRetry: () => void;
  onClear: () => void;
}) {
  return (
    <section className="card card--lift">
      <h1 className="card__title">Connection lost.</h1>
      <p className="card__sub">{message}</p>
      <div className="card__section btn-row">
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          Try again
        </button>
        <button type="button" className="btn btn--ghost" onClick={onClear}>
          Clear current run
        </button>
      </div>
    </section>
  );
}
