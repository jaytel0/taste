import { describe, expect, it } from "vitest";

import { workflowDrainBatchSize } from "../src/workflow/runner";

describe("workflow drain batching", () => {
  it("caps each claimed batch by remaining jobs and configured concurrency", () => {
    expect(workflowDrainBatchSize(24, 8)).toBe(8);
    expect(workflowDrainBatchSize(3, 8)).toBe(3);
    expect(workflowDrainBatchSize(0, 8)).toBe(0);
  });
});
