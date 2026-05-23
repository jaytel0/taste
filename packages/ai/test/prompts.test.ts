import { describe, expect, it } from "vitest";

import { buildSynthesisPrompt } from "../src/prompts";

describe("buildSynthesisPrompt", () => {
  it("anonymizes source model labels and raw artifact frontmatter", () => {
    const prompt = buildSynthesisPrompt({
      image: {
        id: "img_0001",
        basename: "reference.png",
        width: 800,
        height: 600,
      },
      analyses: [
        {
          model: "openai/gpt-5.5",
          text: [
            "---",
            'model: "openai/gpt-5.5"',
            'proxyProvider: "openai"',
            "---",
            "",
            "Strong grid analysis from gpt-5.5.",
          ].join("\n"),
        },
        {
          model: "anthropic/claude-opus-4-1",
          text: [
            "---",
            'model: "anthropic/claude-opus-4-1"',
            'proxyProvider: "anthropic"',
            "---",
            "",
            "Strong spacing analysis from Claude Opus 4 1.",
          ].join("\n"),
        },
      ],
    });

    expect(prompt).toContain("Analysis 1:");
    expect(prompt).toContain("Analysis 2:");
    expect(prompt).toContain("Strong grid analysis from [redacted].");
    expect(prompt).toContain("Strong spacing analysis from [redacted].");
    expect(prompt).not.toContain("openai/gpt-5.5");
    expect(prompt).not.toContain("gpt-5.5");
    expect(prompt).not.toContain("anthropic/claude-opus-4-1");
    expect(prompt).not.toContain("claude-opus-4-1");
    expect(prompt).not.toContain("Claude Opus 4 1");
    expect(prompt).not.toContain("proxyProvider");
  });
});
