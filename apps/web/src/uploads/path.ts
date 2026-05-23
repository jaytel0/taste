export function uploadPathname(runId: string, uploadOrder: number, fileName: string): string {
  const paddedOrder = String(uploadOrder + 1).padStart(4, "0");
  return `${uploadPrefix(runId, uploadOrder)}${safeBlobName(fileName, paddedOrder)}`;
}

export function uploadPrefix(runId: string, uploadOrder: number): string {
  return `runs/${runId}/${String(uploadOrder + 1).padStart(4, "0")}-`;
}

function safeBlobName(fileName: string, fallback: string): string {
  const trimmed = fileName.trim();
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return safe || `image-${fallback}`;
}
