import { describe, expect, it } from "vitest";

import { chunkRuleResults, chunkSynthesizedNotes } from "../src/chunking";

describe("chunkSynthesizedNotes", () => {
  it("includes every note exactly once in deterministic image order", () => {
    const notes = [
      { imageId: "img_0003", file: "img_0003.md", text: "3" },
      { imageId: "img_0001", file: "img_0001.md", text: "1" },
      { imageId: "img_0002", file: "img_0002.md", text: "2" },
    ];

    const chunks = chunkSynthesizedNotes(notes, 2);

    expect(chunks).toEqual([
      {
        id: "chunk_01",
        notes: [
          { imageId: "img_0001", file: "img_0001.md", text: "1" },
          { imageId: "img_0002", file: "img_0002.md", text: "2" },
        ],
      },
      {
        id: "chunk_02",
        notes: [{ imageId: "img_0003", file: "img_0003.md", text: "3" }],
      },
    ]);
  });
});

describe("chunkRuleResults", () => {
  it("groups rule results by fan-in in deterministic chunk order", () => {
    const results = Array.from({ length: 10 }, (_, index) => {
      const id = `chunk_${String(10 - index).padStart(2, "0")}`;
      return { id, files: [`${id}.md`], text: id };
    });

    const groups = chunkRuleResults(results, 6);

    expect(groups.map((group) => group.map((item) => item.id))).toEqual([
      ["chunk_01", "chunk_02", "chunk_03", "chunk_04", "chunk_05", "chunk_06"],
      ["chunk_07", "chunk_08", "chunk_09", "chunk_10"],
    ]);
  });
});
