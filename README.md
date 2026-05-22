# Taste

This repo is organized for three separate concerns:

```text
pipeline/     # existing taste-skill process, tools, and generated artifacts
apps/web/     # Vercel/Next.js backend for the web app version of the pipeline
packages/ai/  # shared AI prompt and pipeline generation package
```

## Pipeline

The current design-taste pipeline lives under [`pipeline/`](pipeline/):

```text
pipeline/process.md  # operating manual
pipeline/tools/      # one small script per pipeline step
pipeline/taste/      # numbered artifacts from corpus -> notes -> rule set -> skill -> trial
```

![Taste pipeline process diagram](pipeline/taste/06-pipeline-diagram/pipeline-process.png)

Start with [`pipeline/process.md`](pipeline/process.md).

Current final skill:

```text
pipeline/taste/04-skill/SKILL.md
```

## Web app

The web app turns the existing pipeline into an interactive product surface in [`apps/web/`](apps/web/).

The app should preserve the current pipeline shape:

1. Curate or upload reference images.
2. Index the corpus.
3. Run image analyses.
4. Synthesize canonical image notes.
5. Generate a concrete visual rule set.
6. Generate a reusable taste skill.
7. Run and inspect clean benchmark trials.

The backend now exposes the pipeline through API routes in [`apps/web/`](apps/web/) and shared AI generation code in [`packages/ai/`](packages/ai/).

Speed-first defaults:

```text
analysis models: openai/gpt-5.5 + anthropic/claude-sonnet-4.6
max images:      100
runner:          Inngest fan-out/fan-in jobs
storage:         Vercel Blob + Postgres
AI access:       per-run AI Gateway token supplied by the user
```
