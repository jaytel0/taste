"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  cancelRun,
  createRun,
  describeError,
  PRE_CREATE_ACCEPTED_TYPES,
  PRE_CREATE_IMAGE_BYTES_CAP,
  PRE_CREATE_IMAGE_CAP,
  type CreateRunInput,
  type CreateRunResponse,
  type CredentialStatus,
} from "../_lib/api";
import { formatBytes } from "../_lib/format";
import { Dropzone } from "./Dropzone";

type SelectedFile = {
  id: string;
  file: File;
  previewUrl: string;
};

type CreateScreenProps = {
  credentials: CredentialStatus;
  onCreated: (response: CreateRunResponse, files: File[]) => void;
};

const FILELIST_SCROLL_THRESHOLD = 6;

export function CreateScreen({ credentials, onCreated }: CreateScreenProps) {
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

  const credentialMode = pickCredentialMode(credentials);

  const handleSubmit = useCallback(async () => {
    setError(null);
    const localError = validateLocally(files);
    if (localError) {
      setError(localError);
      return;
    }
    if (!credentialMode) {
      setError("Connect credentials before starting a run.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: CreateRunInput = {
        credentialMode,
        expectedImageCount: files.length,
      };
      const response = await createRun(payload);
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
  }, [credentialMode, files, onCreated]);

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
  }, [files.length, handleSubmit, submitting]);

  const canSubmit = !submitting && files.length > 0;
  const useScroll = files.length > FILELIST_SCROLL_THRESHOLD;

  const openFilePicker = useCallback(() => inputRef.current?.click(), []);

  // Drag handlers shared by the empty dropzone and the file panel that
  // replaces it once any files exist. Mounting them on a stable wrapper
  // avoids the React-strict re-mount that drops the dragenter/leave pairing.
  const handleDragEnter = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!submitting) setDragActive(true);
    },
    [submitting],
  );
  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!submitting) setDragActive(true);
    },
    [submitting],
  );
  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    // Only clear when the cursor actually leaves the panel — dragging across
    // child rows fires leave/enter pairs that would otherwise flicker.
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setDragActive(false);
  }, []);
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragActive(false);
      if (submitting) return;
      if (event.dataTransfer.files) addFiles(event.dataTransfer.files);
    },
    [addFiles, submitting],
  );

  return (
    <section className="card card--lift">
      <h1 className="card__title">Turn reference images into a taste skill.</h1>
      <p className="card__sub">
        Drop in a corpus, then the pipeline will produce a single reusable SKILL.md.
      </p>

      <div className="card__section">
        {files.length === 0 ? (
          <Dropzone
            active={dragActive}
            disabled={submitting}
            fileCount={files.length}
            totalBytes={totalBytes}
            onActiveChange={setDragActive}
            onSelect={addFiles}
            onClick={openFilePicker}
          />
        ) : (
          <div
            className={`filepanel${dragActive ? " filepanel--active" : ""}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            aria-label="Selected images. Drop more files here to add."
          >
            <div className="filepanel__head">
              <span className="muted">
                {files.length} {files.length === 1 ? "image" : "images"} · {formatBytes(totalBytes)}
              </span>
              <div className="filepanel__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={openFilePicker}
                  disabled={submitting}
                >
                  + Add more
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={clearAll}
                  disabled={submitting}
                >
                  Clear all
                </button>
              </div>
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
          </div>
        )}
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

      {info && <p className="notice notice--quiet">{info}</p>}

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

function pickCredentialMode(status: CredentialStatus): "openrouter" | "direct" | null {
  if (!status.connected) return null;
  if (status.mode === "openrouter") return "openrouter";
  if (status.mode === "direct") return "direct";
  return null;
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
