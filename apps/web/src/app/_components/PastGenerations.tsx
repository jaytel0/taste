"use client";

import { useCallback, useEffect, useState } from "react";

import {
  loadStoredSkillGenerations,
  type StoredSkillGeneration,
} from "../_lib/storage";

export function PastGenerations() {
  const [items, setItems] = useState<StoredSkillGeneration[]>([]);
  const [downloadedId, setDownloadedId] = useState<string | null>(null);

  useEffect(() => {
    setItems(loadStoredSkillGenerations());
  }, []);

  const handleDownload = useCallback((item: StoredSkillGeneration) => {
    const blob = new Blob([item.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "SKILL.md";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloadedId(item.id);
    window.setTimeout(() => setDownloadedId(null), 1600);
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="past" aria-label="Past generations">
      <div className="past__head">
        <h2 className="past__title">Past generations</h2>
      </div>
      <div className="past__list">
        {items.map((item) => (
          <article className="past__item" key={item.id}>
            <div className="past__meta">
              <h3 className="past__name">{item.name}</h3>
              <p className="past__date">{formatGenerationDate(item.createdAt)}</p>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => handleDownload(item)}
            >
              {downloadedId === item.id ? "Downloaded" : "Download"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatGenerationDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
