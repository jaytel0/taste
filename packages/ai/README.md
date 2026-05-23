# AI Pipeline Package

Shared prompt and generation package for the web app backend.

## Purpose

The web app calls stable functions here for AI-backed pipeline steps instead of putting model calls and prompt assembly directly in API routes.

This package preserves the current command-line pipeline semantics while using the Vercel AI SDK with pluggable providers.

## Planned shape

```text
packages/ai/
  src/
    config.ts       # model defaults and output-token defaults
    prompts.ts      # analysis/synthesis/rule/skill prompts
    providers.ts    # provider-routed calls through AI SDK
    pipeline.ts     # step functions used by the web runner
    chunking.ts     # deterministic note chunking
```

Default analysis models:

```text
openai/gpt-5.5
anthropic/claude-sonnet-4-6
```

The package exposes generation functions for raw image analysis, synthesized image notes, rule chunks, the final rule set, and the final skill.

Synthesized image notes are fused from source-neutral analysis inputs. The
synthesis prompt strips raw artifact frontmatter, omits model names from
analysis headings, and redacts known source model ids from analysis text so the
fusion model does not see which analysis came from which model.

Supported credential modes for local tooling and backend callers:

```text
direct           # separate OpenAI and Anthropic keys; intended local default
openai           # one OpenAI key, OpenAI models only
anthropic        # one Anthropic key, Anthropic models only
openrouter       # one OpenRouter key for both OpenAI and Anthropic model IDs
vercel_gateway   # one Vercel AI Gateway key through AI_GATEWAY_API_KEY
```

The hosted web app intentionally exposes OpenRouter OAuth only. Keep direct
provider-key entry out of `apps/web`; reuse this package for local CLI or agent
workflows that need individual OpenAI/Anthropic keys.
