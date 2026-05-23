"use client";

import type { ReactNode } from "react";

import type { CredentialStatus } from "../_lib/api";

const SOURCE_URL = "https://github.com/jaytel0/taste";

type ShellProps = {
  children: ReactNode;
  onClear?: (() => void) | undefined;
  onDisconnect?: (() => void) | undefined;
  runId?: string | undefined;
  credentials?: CredentialStatus | null | undefined;
};

export function Shell({
  children,
  onClear,
  onDisconnect,
  runId,
  credentials,
}: ShellProps) {
  const showFooter = Boolean(runId || onClear || onDisconnect || credentials?.connected);
  return (
    <div className="shell">
      <header className="shell__head">
        <span className="shell__mark">
          <img className="shell__logo" src="/taste.png" alt="" aria-hidden />
          Taste
        </span>
        <div className="shell__head-right">
          <span className="shell__credit" aria-label="Designed with the Taste Skill, version 1">
            Designed with Taste Skill V1
          </span>
          <span className="shell__divider" aria-hidden />
          <a
            className="shell__source"
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
          >
            <GithubGlyph />
            <span>View source</span>
          </a>
        </div>
      </header>
      <main className="shell__main">{children}</main>
      {showFooter && (
        <footer className="shell__foot">
          <div className="shell__foot-left">
            {credentials?.connected && (
              <span className="credchip" aria-label={`Connected via ${describeMode(credentials)}`}>
                <span className="credchip__dot" />
                <span className="credchip__label">{describeMode(credentials)}</span>
              </span>
            )}
          </div>
          <div className="shell__foot-right">
            {onDisconnect && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={onDisconnect}>
                Disconnect
              </button>
            )}
            {onClear && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={onClear}>
                Clear current run
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

function describeMode(status: CredentialStatus): string {
  if (status.mode === "openrouter") {
    return "OpenRouter";
  }
  return "Connected";
}

function GithubGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
