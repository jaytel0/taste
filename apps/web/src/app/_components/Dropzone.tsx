"use client";

import { formatBytes } from "../_lib/format";
import { PRE_CREATE_IMAGE_CAP } from "../_lib/api";

type DropzoneProps = {
  active: boolean;
  disabled: boolean;
  fileCount: number;
  totalBytes: number;
  onActiveChange: (value: boolean) => void;
  onSelect: (files: FileList | File[]) => void;
  onClick: () => void;
};

export function Dropzone({
  active,
  disabled,
  fileCount,
  totalBytes,
  onActiveChange,
  onSelect,
  onClick,
}: DropzoneProps) {
  return (
    <div
      className={`dropzone${active ? " dropzone--active" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!disabled) onClick();
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !disabled) {
          event.preventDefault();
          onClick();
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) onActiveChange(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) onActiveChange(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        onActiveChange(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onActiveChange(false);
        if (disabled) return;
        if (event.dataTransfer.files) onSelect(event.dataTransfer.files);
      }}
    >
      <span className="dropzone__glyph" aria-hidden>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </span>
      <div>
        <div className="dropzone__primary">
          {fileCount === 0
            ? "Drop images, or browse"
            : `${fileCount} ${fileCount === 1 ? "image" : "images"} — ${formatBytes(totalBytes)}`}
        </div>
        <div className="dropzone__secondary">
          JPG · PNG · WebP · Max {PRE_CREATE_IMAGE_CAP}
        </div>
      </div>
    </div>
  );
}
