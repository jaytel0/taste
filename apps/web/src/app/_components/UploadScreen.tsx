"use client";

import { upload } from "@vercel/blob/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  cancelRun,
  describeError,
  startRun,
  type RunCredentials,
} from "../_lib/api";
import { formatBytes } from "../_lib/format";

const UPLOAD_CONCURRENCY = 12;
const FILELIST_SCROLL_THRESHOLD = 6;

type UploadState = "pending" | "uploading" | "done" | "error";

type FileItem = {
  uploadOrder: number;
  file: File;
  state: UploadState;
  error?: string | undefined;
};

type UploadScreenProps = {
  creds: RunCredentials;
  files: File[];
  onComplete: () => void;
  onAbandon: () => void;
};

export function UploadScreen({ creds, files, onComplete, onAbandon }: UploadScreenProps) {
  const [items, setItems] = useState<FileItem[]>(() =>
    files.map((file, index) => ({ uploadOrder: index, file, state: "pending" as const })),
  );
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const startedRef = useRef(false);
  const uploadingRef = useRef(false);
  const abortedRef = useRef(false);

  const counts = useMemo(() => {
    let done = 0;
    let failed = 0;
    for (const item of items) {
      if (item.state === "done") done += 1;
      else if (item.state === "error") failed += 1;
    }
    return { done, failed, total: items.length };
  }, [items]);

  const updateItem = useCallback((order: number, patch: Partial<FileItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.uploadOrder === order ? { ...item, ...patch } : item)),
    );
  }, []);

  const uploadOne = useCallback(
    async (item: FileItem): Promise<boolean> => {
      if (abortedRef.current) return false;
      updateItem(item.uploadOrder, { state: "uploading", error: undefined });
      try {
        await upload(item.file.name, item.file, {
          access: "public",
          handleUploadUrl: "/api/uploads",
          contentType: item.file.type,
          clientPayload: JSON.stringify({
            runId: creds.runId,
            runSecret: creds.runSecret,
            uploadOrder: item.uploadOrder,
            fileName: item.file.name,
            contentType: item.file.type,
            size: item.file.size,
          }),
        });
        if (abortedRef.current) return false;
        updateItem(item.uploadOrder, { state: "done" });
        return true;
      } catch (err) {
        if (abortedRef.current) return false;
        updateItem(item.uploadOrder, {
          state: "error",
          error: describeError(err, "Upload failed for this image."),
        });
        return false;
      }
    },
    [creds.runId, creds.runSecret, updateItem],
  );

  const tryStart = useCallback(async () => {
    if (abortedRef.current) return;
    setStarting(true);
    setStartError(null);
    try {
      await startRun(creds);
      onComplete();
    } catch (err) {
      setStartError(describeError(err, "Could not start the run."));
      setStarting(false);
    }
  }, [creds, onComplete]);

  const runUploads = useCallback(async () => {
    if (uploadingRef.current) return;
    if (abortedRef.current) return;
    uploadingRef.current = true;
    try {
      const pending = itemsRef.current.filter(
        (item) => item.state === "pending" || item.state === "error",
      );
      const results = await mapConcurrent(pending, UPLOAD_CONCURRENCY, uploadOne);
      if (results.length > 0 && results.every(Boolean)) {
        await tryStart();
      }
    } finally {
      uploadingRef.current = false;
    }
  }, [tryStart, uploadOne]);

  const handleCancel = useCallback(async () => {
    if (canceling) return;
    setCanceling(true);
    abortedRef.current = true;
    try {
      await cancelRun(creds);
    } catch {
      // Best-effort. We still abandon locally so the user isn't stuck.
    }
    onAbandon();
  }, [canceling, creds, onAbandon]);

  // Kick uploads off once on mount.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void runUploads();
  }, [runUploads]);

  // Tab title reflects upload progress so a backgrounded tab is informative.
  useEffect(() => {
    if (counts.total === 0) return;
    document.title = `Uploading ${counts.done}/${counts.total} · Taste`;
    return () => {
      document.title = "Taste";
    };
  }, [counts.done, counts.total]);

  const allDone = counts.done === counts.total && counts.failed === 0;
  const progressPercent =
    counts.total === 0 ? 0 : Math.round((counts.done / counts.total) * 100);
  const useScroll = items.length > FILELIST_SCROLL_THRESHOLD;

  return (
    <section className="card card--lift">
      <div className="card__head-row">
        <p className="card__eyebrow">Uploading</p>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => void handleCancel()}
          disabled={canceling || starting}
        >
          {canceling ? "Canceling…" : "Cancel"}
        </button>
      </div>
      <div className="metric">
        <span className="bigvalue">{counts.done}</span>
        <span className="bigvalue__unit"> / {counts.total}</span>
      </div>
      <p className="card__sub" aria-live="polite">
        {allDone
          ? starting
            ? "Uploads complete. Starting…"
            : "Uploads complete."
          : counts.failed > 0
          ? `${counts.failed} ${counts.failed === 1 ? "image" : "images"} failed. Retry to continue.`
          : "Uploading reference images."}
      </p>

      <div className="card__section">
        <div className="progress" aria-label="Upload progress">
          <div className="progress__fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <ul
        className={`filelist${useScroll ? " filelist--scroll" : ""}`}
        aria-label="Upload list"
      >
        {items.map((item) => (
          <li key={item.uploadOrder} className="filerow">
            <div className="filerow__text">
              <span className="filerow__name">{item.file.name}</span>
              <span className="filerow__meta">
                {formatBytes(item.file.size)}
                {item.error ? ` · ${item.error}` : ""}
              </span>
            </div>
            <span className={statusClass(item.state)}>{statusLabel(item.state)}</span>
            <span aria-hidden />
          </li>
        ))}
      </ul>

      {startError && <p className="notice">{startError}</p>}

      {(counts.failed > 0 || startError) && (
        <div className="card__section btn-row">
          {counts.failed > 0 && (
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => void runUploads()}
              disabled={starting || canceling}
            >
              Retry failed uploads
            </button>
          )}
          {allDone && startError && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void tryStart()}
              disabled={starting || canceling}
            >
              {starting ? (
                <>
                  <span className="spinner" /> Starting
                </>
              ) : (
                "Start pipeline"
              )}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function statusLabel(state: UploadState): string {
  switch (state) {
    case "pending":
      return "Queued";
    case "uploading":
      return "Uploading";
    case "done":
      return "Uploaded";
    case "error":
      return "Failed";
  }
}

function statusClass(state: UploadState): string {
  if (state === "done") return "filerow__status filerow__status--done";
  if (state === "error") return "filerow__status filerow__status--err";
  return "filerow__status";
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.min(items.length, concurrency));
  let next = 0;
  const results: R[] = [];
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        const item = items[index];
        if (item !== undefined) results[index] = await worker(item);
      }
    }),
  );
  return results;
}
