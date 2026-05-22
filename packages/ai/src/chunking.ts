import type { ChunkSpec, RuleChunkResult } from "./types";

export function chunkSynthesizedNotes(
  notes: Array<{ imageId: string; file: string; text: string }>,
  chunkSize = 10,
): ChunkSpec[] {
  const sorted = [...notes].sort((a, b) =>
    a.imageId.localeCompare(b.imageId, undefined, { numeric: true }),
  );
  const chunks: ChunkSpec[] = [];
  for (let index = 0; index < sorted.length; index += chunkSize) {
    chunks.push({
      id: `chunk_${String(chunks.length + 1).padStart(2, "0")}`,
      notes: sorted.slice(index, index + chunkSize),
    });
  }
  return chunks;
}

export function chunkRuleResults(
  results: RuleChunkResult[],
  fanIn = 6,
): RuleChunkResult[][] {
  const sorted = [...results].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const groups: RuleChunkResult[][] = [];
  const size = Math.max(2, fanIn);
  for (let index = 0; index < sorted.length; index += size) {
    groups.push(sorted.slice(index, index + size));
  }
  return groups;
}
