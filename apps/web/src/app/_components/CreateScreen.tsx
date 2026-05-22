"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  cancelRun,
  createRun,
  describeError,
  PRE_CREATE_ACCEPTED_TYPES,
  PRE_CREATE_IMAGE_BYTES_CAP,
  PRE_CREATE_IMAGE_CAP,
  type CreateRunResponse,
} from "../_lib/api";
import { formatBytes } from "../_lib/format";
import { Dropzone } from "./Dropzone";

type SelectedFile = {
  id: string;
  file: File;
  previewUrl: string;
};

type CreateScreenProps = {
  onCreated: (response: CreateRunResponse, files: File[]) => void;
};

const FILELIST_SCROLL_THRESHOLD = 6;

export function CreateScreen({ onCreated }: CreateScreenProps) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  // Revoke any outstanding object URLs when the screen unmounts so we don't
  // leak memory in browsers that don't aggressively garbage-collect them.
  useEffect(() => {
    return () => {
      filesRef.current.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
  }, []);

  const totalBytes = useMemo(
    () => files.reduce((acc, f) => acc + f.file.size, 0),
    [files],
  );

  const addFiles = useCallback((incoming: FileList | File[]) => {
    setError(null);
    setInfo(null);
    const candidates: SelectedFile[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(incoming)) {
      if (!isAcceptedType(file.type)) {
        rejected.push(`${file.name}: unsupported image type`);
        continue;
      }
      if (file.size > PRE_CREATE_IMAGE_BYTES_CAP) {
        rejected.push(`${file.name}: larger than ${formatBytes(PRE_CREATE_IMAGE_BYTES_CAP)}`);
        continue;
      }
      candidates.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (rejected.length > 0) {
      setError(rejected.slice(0, 3).join("; "));
    }
    setFiles((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const merged = [...prev];
      let duplicates = 0;
      for (const item of candidates) {
        if (seen.has(item.id)) {
          // Same file selected twice — drop the duplicate's URL so we don't
          // leak it, and keep the existing entry.
          URL.revokeObjectURL(item.previewUrl);
          duplicates += 1;
          continue;
        }
        merged.push(item);
        seen.add(item.id);
      }
      if (merged.length > PRE_CREATE_IMAGE_CAP) {
        const overflow = merged.slice(PRE_CREATE_IMAGE_CAP);
        overflow.forEach((f) => URL.revokeObjectURL(f.previewUrl));
        const ignored = overflow.length;
        setInfo(
          `${ignored} ${ignored === 1 ? "image was" : "images were"} ignored — limit is ${PRE_CREATE_IMAGE_CAP}.`,
        );
        return merged.slice(0, PRE_CREATE_IMAGE_CAP);
      }
      if (duplicates > 0) {
        setInfo(
          `${duplicates} ${duplicates === 1 ? "duplicate" : "duplicates"} ignored.`,
        );
      }
      return merged;
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const removed = prev.find((f) => f.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    setFiles((prev) => {
      prev.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      return [];
    });
    setError(null);
    setInfo(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    setError(null);
    const localError = validateLocally(files);
    if (localError) {
      setError(localError);
      return;
    }
    setSubmitting(true);
    try {
      const aiGatewayToken = token.trim();
      const response = await createRun({
        ...(aiGatewayToken ? { aiGatewayToken } : {}),
        expectedImageCount: files.length,
      });
      const serverError = validateAgainstServer(files, response);
      if (serverError) {
        setError(serverError);
        await cancelRun({ runId: response.runId, runSecret: response.runSecret }).catch(() => {});
        setSubmitting(false);
        return;
      }
      onCreated(response, files.map((f) => f.file));
    } catch (err) {
      setError(describeError(err, "Could not create the run."));
      setSubmitting(false);
    }
  }, [files, onCreated, token]);

  // Cmd/Ctrl+Enter submits when the form is valid.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (submitting) return;
      if (files.length === 0) return;
      event.preventDefault();
      void handleSubmit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [files.length, handleSubmit, submitting, token]);

  const canSubmit = !submitting && files.length > 0;
  const useScroll = files.length > FILELIST_SCROLL_THRESHOLD;

  return (
    <section className="card card--lift">
      <p className="card__eyebrow">New run</p>
      <h1 className="card__title">Turn reference images into a taste skill.</h1>
      <p className="card__sub">
        Drop in a corpus, then the pipeline will produce a single reusable SKILL.md.
      </p>

      <div className="card__section">
        <Dropzone
          active={dragActive}
          disabled={submitting}
          fileCount={files.length}
          totalBytes={totalBytes}
          onActiveChange={setDragActive}
          onSelect={addFiles}
          onClick={() => inputRef.current?.click()}
        />
        <input
          ref={inputRef}
          type="file"
          accept={PRE_CREATE_ACCEPTED_TYPES.join(",")}
          multiple
          className="dropzone__input"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <>
          <div className="filelist__head">
            <span className="muted">
              {files.length} {files.length === 1 ? "image" : "images"} · {formatBytes(totalBytes)}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={clearAll}
              disabled={submitting}
            >
              Clear all
            </button>
          </div>
          <ul
            className={`filelist${useScroll ? " filelist--scroll" : ""}`}
            aria-label="Selected images"
          >
            {files.map((item) => (
              <li key={item.id} className="filerow filerow--withthumb">
                <img
                  src={item.previewUrl}
                  alt=""
                  className="filerow__thumb"
                  loading="lazy"
                />
                <div className="filerow__text">
                  <span className="filerow__name">{item.file.name}</span>
                  <span className="filerow__meta">{formatBytes(item.file.size)}</span>
                </div>
                <span className="filerow__status">Ready</span>
                <button
                  type="button"
                  aria-label={`Remove ${item.file.name}`}
                  className="filerow__remove"
                  onClick={() => removeFile(item.id)}
                  disabled={submitting}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {info && <p className="notice notice--quiet">{info}</p>}

      <div className="card__section">
        <label className="field" htmlFor="ai-token">
          <span className="field__label">AI Gateway token</span>
          <div className="input-wrap">
            <input
              id="ai-token"
              type={showToken ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              className="input input--mono"
              placeholder="sk-aigw-…"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              disabled={submitting}
            />
            <button
              type="button"
              className="input-wrap__toggle"
              aria-label={showToken ? "Hide token" : "Show token"}
              onClick={() => setShowToken((s) => !s)}
              disabled={submitting}
            >
              {showToken ? <EyeOffGlyph /> : <EyeGlyph />}
            </button>
          </div>
          <span className="field__hint">
            Optional. Leave blank to use this Vercel project's AI Gateway access.
          </span>
        </label>
      </div>

      {error && <p className="notice">{error}</p>}

      <div className="card__section btn-row">
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <>
              <span className="spinner" /> Preparing
            </>
          ) : (
            "Start run"
          )}
        </button>
        {canSubmit && <span className="kbd">⌘↵</span>}
        {!canSubmit && !submitting && (
          <span className="btn-row__caption muted">
            {files.length === 0
              ? "Add images to begin"
              : ""}
          </span>
        )}
      </div>
    </section>
  );
}

function isAcceptedType(type: string): boolean {
  return (PRE_CREATE_ACCEPTED_TYPES as readonly string[]).includes(type);
}

function validateLocally(files: SelectedFile[]): string | null {
  if (files.length === 0) return "Add at least one reference image.";
  if (files.length > PRE_CREATE_IMAGE_CAP) {
    return `This pipeline accepts up to ${PRE_CREATE_IMAGE_CAP} images per run.`;
  }
  const oversized = files.find((item) => item.file.size > PRE_CREATE_IMAGE_BYTES_CAP);
  if (oversized) {
    return `${oversized.file.name} is larger than ${formatBytes(PRE_CREATE_IMAGE_BYTES_CAP)}.`;
  }
  return null;
}

function validateAgainstServer(
  files: SelectedFile[],
  response: CreateRunResponse,
): string | null {
  if (files.length > response.maxImages) {
    return `This pipeline accepts up to ${response.maxImages} images per run.`;
  }
  const disallowed = files.find((item) => !response.acceptedTypes.includes(item.file.type));
  if (disallowed) return `${disallowed.file.name} is not an accepted image type.`;
  const tooLarge = files.find((item) => item.file.size > response.maxImageBytes);
  if (tooLarge) {
    return `${tooLarge.file.name} is larger than ${formatBytes(response.maxImageBytes)}.`;
  }
  return null;
}

function EyeGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6.5 0-10-7-10-7a18.78 18.78 0 0 1 4.06-5.06" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6.5 0 10 7 10 7a18.78 18.78 0 0 1-2.16 3.19" />
      <path d="M1 1l22 22" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </svg>
  );
}
