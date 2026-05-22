"use client";

import { useCallback, useEffect, useState } from "react";

import { describeError, fetchSkill, type RunCredentials } from "../_lib/api";

type SkillScreenProps = {
  creds: RunCredentials;
  onStartAnother: () => void;
};

export function SkillScreen({ creds, onStartAnother }: SkillScreenProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setContent(await fetchSkill(creds));
    } catch (err) {
      setError(describeError(err, "Could not fetch the skill."));
    } finally {
      setLoading(false);
    }
  }, [creds]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCopy = useCallback(async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Clipboard access was blocked. Use the download option instead.");
    }
  }, [content]);

  const handleDownload = useCallback(() => {
    if (!content) return;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "SKILL.md";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [content]);

  // Keyboard shortcuts:
  // - ⌘C / Ctrl+C copies the skill, but only when the user has no active text
  //   selection — otherwise we'd hijack their natural copy gesture.
  // - ⌘↓ / Ctrl+↓ downloads.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!content) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (event.key === "c" || event.key === "C") {
        const selection = window.getSelection()?.toString();
        if (selection && selection.length > 0) return;
        event.preventDefault();
        void handleCopy();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        handleDownload();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [content, handleCopy, handleDownload]);

  return (
    <section className="card card--lift">
      <p className="card__eyebrow">Complete</p>
      <h1 className="card__title">Your taste skill is ready.</h1>
      <p className="card__sub">
        A single SKILL.md captured from the pipeline. Copy it, save it, or start a new run.
      </p>

      <div className="card__section btn-row">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void handleCopy()}
          disabled={!content || loading}
        >
          {copied ? (
            <>
              <CheckGlyph /> Copied
            </>
          ) : (
            "Copy to clipboard"
          )}
        </button>
        <button
          type="button"
          className="btn btn--quiet"
          onClick={handleDownload}
          disabled={!content || loading}
        >
          Download SKILL.md
        </button>
        <button type="button" className="btn btn--ghost" onClick={onStartAnother}>
          Start another run
        </button>
        {content && <span className="kbd">⌘C</span>}
      </div>

      {loading && (
        <p className="notice notice--quiet">
          <span className="spinner" /> Loading skill…
        </p>
      )}

      {error && (
        <div className="notice">
          {error}
          <div className="notice__actions">
            <button type="button" className="btn btn--quiet btn--sm" onClick={() => void load()}>
              Try again
            </button>
          </div>
        </div>
      )}

      {content && (
        <div className="skill" aria-label="Generated SKILL.md">
          <pre className="skill__pre">{content}</pre>
        </div>
      )}
    </section>
  );
}

function CheckGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
