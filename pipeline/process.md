# Taste Pipeline

This directory now holds only stable pipeline inputs and the current generated
skill:

```text
pipeline/taste/01-corpus/reference-images/  # reference image set used for testing
pipeline/taste/01-corpus/images.jsonl       # deterministic index of the reference set
pipeline/taste/04-skill/SKILL.md            # current reusable taste skill
```

The production pipeline lives in the Vercel web app under `apps/web` and writes
per-run artifacts to Vercel Blob:

```text
runs/{runId}/01-corpus/images.jsonl
runs/{runId}/02-image-notes/raw/{imageId}/{model}.md
runs/{runId}/02-image-notes/synthesized/{imageId}.md
runs/{runId}/03-rule-set/chunks/{chunkId}-rules.md
runs/{runId}/03-rule-set/merges/{mergeId}-rules.md
runs/{runId}/03-rule-set/rule-set.md
runs/{runId}/04-skill/SKILL.md
```

## Current Production Process

1. Upload up to 100 reference images.
2. Index uploaded images, dedupe exact duplicates, and assign stable image ids.
3. For each active image, run the configured raw analysis models in parallel.
4. As soon as an image's raw analyses finish, synthesize its canonical note
   with `SYNTHESIS_MODEL` (`openai/gpt-5.5` by default). The raw analysis
   inputs are anonymized before fusion: artifact frontmatter is stripped, model
   names are not shown in section titles, and known source model ids are
   redacted from carried-forward error text so the fusion model cannot favor
   its own analysis. Source model metadata remains only in stored artifact
   metadata for audit/debugging.
5. Split synthesized notes into rule chunks.
6. If there are too many chunks for one clean merge, reduce them through
   intermediate merge layers using `RULE_MERGE_FAN_IN`.
7. Generate the final rule set.
8. Generate the final `SKILL.md`.

## Tuning

The app defaults are speed-first with bounded safety:

```text
MAX_IMAGES_PER_RUN=100
ANALYSIS_MODELS=openai/gpt-5.5,anthropic/claude-sonnet-4-6
SYNTHESIS_MODEL=openai/gpt-5.5
RULE_MODEL=openai/gpt-5.5
SKILL_MODEL=openai/gpt-5.5
ANALYZE_IMAGE_CONCURRENCY=8
SYNTHESIZE_NOTE_CONCURRENCY=8
RULE_CHUNK_SIZE=10
RULE_MERGE_FAN_IN=6
```

High-volume stages retry transient gateway failures and create explicit
soft-failure artifacts when a single image/model path cannot recover. The run
should continue whenever enough evidence remains to produce a final skill.

## Production E2E

Run the production reference-image flow from the repo root:

```bash
set -a
. apps/web/.env.local
set +a
npm run e2e:prod --workspace @taste/web
```

By default this uses `https://taste.jaytel.com` and the reference
images in `pipeline/taste/01-corpus/reference-images`.
