"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  describeError,
  fetchRunEvents,
  fetchRunImages,
  fetchRunStatus,
  isTerminal,
  type RunCredentials,
  type RunEvent,
  type RunImage,
  type RunStatus,
} from "../_lib/api";
import {
  formatCount,
  formatFraction,
  formatStatus,
  formatTime,
  mergeEvents,
} from "../_lib/format";

const POLL_INTERVAL_MS = 2000;
const MAX_VISIBLE_EVENTS = 8;
const MAX_VISIBLE_THUMBS = 24;

type ProcessingScreenProps = {
  creds: RunCredentials;
  initialStatus?: RunStatus | undefined;
  onComplete: () => void;
  onAbandon: () => void;
};

export function ProcessingScreen({
  creds,
  initialStatus,
  onComplete,
  onAbandon,
}: ProcessingScreenProps) {
  const [status, setStatus] = useState<RunStatus | null>(initialStatus ?? null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [pollError, setPollError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [imageMap, setImageMap] = useState<Map<string, RunImage>>(() => new Map());
  // synthesizedIds is ordered newest-first so the most recent thumbnail
  // appears on the leading edge of the cluster.
  const [synthesizedIds, setSynthesizedIds] = useState<string[]>([]);
  const lastEventIdRef = useRef(0);
  const completionFiredRef = useRef(false);
  const imageMapRef = useRef(imageMap);
  imageMapRef.current = imageMap;

  const refreshImages = useCallback(async () => {
    try {
      const images = await fetchRunImages(creds);
      setImageMap((prev) => {
        if (images.length === prev.size && images.every((img) => prev.has(img.imageId))) {
          return prev;
        }
        const next = new Map(prev);
        for (const img of images) next.set(img.imageId, img);
        return next;
      });
    } catch {
      // Thumbnails are decorative — a failure here shouldn't surface as an
      // error to the user. The next event tick will retry.
    }
  }, [creds]);

  const tick = useCallback(async () => {
    try {
      const [nextStatus, nextEvents] = await Promise.all([
        fetchRunStatus(creds),
        fetchRunEvents(creds, lastEventIdRef.current),
      ]);
      setStatus(nextStatus);
      setPollError(null);
      if (nextEvents.length > 0) {
        lastEventIdRef.current = Math.max(
          lastEventIdRef.current,
          ...nextEvents.map((e) => e.id),
        );
        setEvents((prev) => mergeEvents(prev, nextEvents));
        const newlySynthesized = extractSynthesizedIds(nextEvents);
        if (newlySynthesized.length > 0) {
          // If a synthesized event arrives for an imageId we haven't seen yet
          // (race with indexing), refresh the image map so it appears next tick.
          if (newlySynthesized.some((id) => !imageMapRef.current.has(id))) {
            void refreshImages();
          }
          setSynthesizedIds((prev) => prependUnique(prev, newlySynthesized));
        }
      }
      if (
        nextStatus.status === "complete" &&
        nextStatus.artifacts.skillReady &&
        !completionFiredRef.current
      ) {
        completionFiredRef.current = true;
        onComplete();
      }
    } catch (err) {
      setPollError(describeError(err, "Lost connection. Will keep trying."));
    }
  }, [creds, onComplete, refreshImages]);

  // Kick a fetch immediately so the screen never shows empty data.
  useEffect(() => {
    void tick();
  }, [tick]);

  // Fetch the image map once when the screen mounts; we'll refresh on demand
  // if a synthesized event arrives for an unknown imageId.
  useEffect(() => {
    void refreshImages();
  }, [refreshImages]);

  // Poll on an interval while the run is still in progress.
  useEffect(() => {
    if (paused) return;
    if (status && isTerminal(status.status)) return;
    const id = window.setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [paused, status, tick]);

  // Tab title mirrors progress so a backgrounded tab can be glanced at.
  useEffect(() => {
    if (!status) {
      document.title = "Taste";
      return;
    }
    if (status.status === "failed" || status.status === "canceled") {
      document.title = "Failed · Taste";
    } else if (status.status === "complete") {
      document.title = "✓ Taste";
    } else {
      document.title = `${status.progressPercent}% · Taste`;
    }
    return () => {
      document.title = "Taste";
    };
  }, [status]);

  const recentEvents = useMemo(
    () => events.slice(-MAX_VISIBLE_EVENTS).reverse(),
    [events],
  );

  const failed = status?.status === "failed" || status?.status === "canceled";
  const progress = status?.progressPercent ?? 0;
  const isComplete = status?.status === "complete";

  return (
    <section className="card card--lift">
      <div className="row row--baseline">
        <div className="metric">
          <span className="bigvalue">{failed ? "—" : progress}</span>
          {!failed && <span className="bigvalue__unit">%</span>}
        </div>
        <StatusPill status={status} failed={failed} pollError={pollError} />
      </div>
      <p className="card__sub card__sub--after-row" aria-live="polite">
        {failed
          ? status?.errorMessage ?? "The pipeline stopped before completing."
          : status?.currentStep ?? "Connecting to the run…"}
      </p>

      <div className="card__section">
        <div className="progress" aria-label="Pipeline progress">
          <div
            className={progressFillClass(failed, isComplete)}
            style={{ width: failed ? "0%" : `${Math.max(2, progress)}%` }}
          />
        </div>
      </div>

      <div className="stats">
        <StatRow label="Images" value={formatCount(status?.counts.images)} />
        <StatRow
          label="Raw analyses"
          value={formatFraction(status?.counts.rawAnalyses, status?.counts.rawAnalysisTotal)}
        />
        <StatRow
          label="Synthesized notes"
          value={formatFraction(status?.counts.synthesizedNotes, status?.counts.images)}
        />
        <StatRow
          label="Rule chunks"
          value={formatFraction(status?.counts.ruleChunks, status?.counts.ruleChunkTotal)}
        />
      </div>

      {synthesizedIds.length > 0 && (
        <ThumbCluster ids={synthesizedIds} imageMap={imageMap} />
      )}

      {recentEvents.length > 0 && (
        <div className="events" aria-label="Recent events">
          <p className="events__title">Recent activity</p>
          {recentEvents.map((event) => (
            <div className="event" key={event.id}>
              <span className="event__time">{formatTime(event.createdAt)}</span>
              <span className="event__msg">{event.message}</span>
            </div>
          ))}
        </div>
      )}

      {pollError && (
        <div className="notice">
          {pollError}
          <div className="notice__actions">
            <button
              type="button"
              className="btn btn--quiet btn--sm"
              onClick={() => {
                setPollError(null);
                void tick();
              }}
            >
              Retry now
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? "Resume polling" : "Pause polling"}
            </button>
          </div>
        </div>
      )}

      {failed && (
        <div className="card__section btn-row">
          <button type="button" className="btn btn--primary" onClick={onAbandon}>
            Start a new run
          </button>
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              completionFiredRef.current = false;
              void tick();
            }}
          >
            Refresh status
          </button>
        </div>
      )}
    </section>
  );
}

function progressFillClass(failed: boolean, isComplete: boolean): string {
  const parts = ["progress__fill"];
  if (failed) parts.push("progress__fill--idle");
  if (isComplete) parts.push("progress__fill--complete");
  return parts.join(" ");
}

function StatusPill({
  status,
  failed,
  pollError,
}: {
  status: RunStatus | null;
  failed: boolean;
  pollError: string | null;
}) {
  if (failed) {
    return (
      <span className="statuspill statuspill--err">
        <span className="statuspill__dot" /> {status ? formatStatus(status.status) : "Failed"}
      </span>
    );
  }
  if (pollError) {
    return (
      <span className="statuspill">
        <span className="statuspill__dot" /> Reconnecting
      </span>
    );
  }
  if (!status) {
    return (
      <span className="statuspill">
        <span className="statuspill__dot" /> Loading
      </span>
    );
  }
  if (status.status === "complete") {
    return (
      <span className="statuspill statuspill--done">
        <span className="statuspill__dot" /> Complete
      </span>
    );
  }
  return (
    <span className="statuspill statuspill--live">
      <span className="statuspill__dot" /> {formatStatus(status.status)}
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
    </div>
  );
}

function ThumbCluster({
  ids,
  imageMap,
}: {
  ids: string[];
  imageMap: Map<string, RunImage>;
}) {
  const visible = ids.slice(0, MAX_VISIBLE_THUMBS);
  // Drop any ids we don't yet have a URL for. They'll appear on the next tick.
  const resolved = visible
    .map((id) => ({ id, image: imageMap.get(id) }))
    .filter((entry): entry is { id: string; image: RunImage } => Boolean(entry.image));
  if (resolved.length === 0) return null;
  return (
    <div className="thumbcluster" aria-label="Synthesized images">
      <p className="thumbcluster__title">Synthesized</p>
      <div className="thumbcluster__grid">
        {resolved.map(({ id, image }) => (
          <div
            key={id}
            className="thumbcluster__item"
            style={{ ['--tilt' as string]: `${tiltFor(id)}deg` }}
          >
            <img src={image.blobUrl} alt="" loading="lazy" />
          </div>
        ))}
      </div>
    </div>
  );
}

function extractSynthesizedIds(events: RunEvent[]): string[] {
  const ids: string[] = [];
  // Walk newest-to-oldest so the first item in the returned list is the most
  // recent. The merge step below preserves that ordering.
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.type !== "image.synthesized") continue;
    const imageId = event.data?.imageId;
    if (typeof imageId === "string" && imageId.length > 0) ids.push(imageId);
  }
  return ids;
}

function prependUnique(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing);
  const fresh = incoming.filter((id) => !seen.has(id));
  if (fresh.length === 0) return existing;
  return [...fresh, ...existing];
}

// Deterministic per-imageId tilt in the range [-2°, +2°], so re-renders never
// rotate a thumb into a new pose.
function tiltFor(imageId: string): number {
  let h = 0;
  for (let i = 0; i < imageId.length; i++) {
    h = (h * 31 + imageId.charCodeAt(i)) | 0;
  }
  // Map h into [-20, 20], then divide by 10 → [-2.0, 2.0].
  const slot = ((h % 41) + 41) % 41; // 0..40
  return (slot - 20) / 10;
}
