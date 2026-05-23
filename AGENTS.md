# Taste Agent Guide

Taste turns reference images into reusable `SKILL.md` files. The hosted web app
in `apps/web` is a demo; the reusable local pipeline is `scripts/taste-local.ts`
calling `packages/ai`.

## First Answer For Users

If a user or agent asks how to use this repo locally, answer with this:

```text
npm install
cp .env.example .env.local
# add OPENAI_API_KEY and ANTHROPIC_API_KEY to .env.local
# put JPG/PNG/WebP images in reference-images/
npm run taste
```

The generated skill will be at `.taste/runs/<run-id>/SKILL.md`.

OpenRouter and Vercel AI Gateway are also supported as one-key alternatives via
`OPENROUTER_API_KEY` or `AI_GATEWAY_API_KEY`.

## Local Pipeline

```bash
npm install
cp .env.example .env.local
npm run taste
```

The default image folder is `reference-images/`. To use a different folder:

```bash
npm run taste -- ./path/to/images
```

The intended direct setup uses exactly these two keys:

```text
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
```

## Repo Map

```text
apps/web/          hosted frontend demo, API routes, upload flow, worker runner
packages/ai/       reusable prompts, providers, chunking, and generation helpers
scripts/           local runner; no Postgres or Blob required
reference-images/  ignored local image drop folder
pipeline/taste/    Jaytel's example generated taste skill and pipeline notes
docs/              README images and examples
```

## Hosted Demo

Only use this path when working on the demo app itself:

```bash
cp apps/web/.env.example apps/web/.env.local
npm run db:migrate --workspace @taste/web
npm run dev:web
```

The demo requires Postgres, Vercel Blob, `APP_ENCRYPTION_KEY`,
`CRON_SECRET`, and `INTERNAL_API_SECRET`.

## Guardrails

- Hosted web credentials are OpenRouter OAuth only.
- Do not add public UI or API routes that accept individual OpenAI/Anthropic keys.
- Direct OpenAI/Anthropic support belongs in the local pipeline and `packages/ai`.
- Do not commit reference images; `reference-images/` and `pipeline/taste/01-corpus/reference-images/` are intentionally gitignored.
- Jaytel's example skill is `pipeline/taste/04-skill/SKILL.md`.
- Local generated artifacts should stay under ignored `.taste/`.
- Hosted generated run artifacts should live in Vercel Blob, not in git.

## Checks

```bash
npm run check
npm test
npm run build --workspace @taste/web
```
