# Taste Agent Guide

Taste is a Next.js web app that turns reference images into a reusable
`SKILL.md`. The active product surface is `apps/web`; shared model/pipeline code
lives in `packages/ai`.

## Quick Start

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run db:migrate --workspace @taste/web
npm run dev:web
```

Open `http://localhost:3000` and connect with OpenRouter.

Required local environment values:

```text
DATABASE_URL=...
APP_ENCRYPTION_KEY=32+ character secret
BLOB_READ_WRITE_TOKEN=...
CRON_SECRET=16+ character secret
INTERNAL_API_SECRET=32+ character secret
```

## Repo Map

```text
apps/web/      Next.js frontend, API routes, upload flow, worker runner
packages/ai/   reusable prompts, providers, chunking, and generation helpers
pipeline/      pipeline notes and the checked-in generated taste skill
```

## Guardrails

- Hosted web credentials are OpenRouter OAuth only.
- Do not add public UI or API routes that accept individual OpenAI/Anthropic keys.
- Direct OpenAI/Anthropic support belongs in `packages/ai` for local CLI or agent workflows.
- Do not commit reference images; `pipeline/taste/01-corpus/reference-images/` is intentionally gitignored.
- Generated run artifacts should live in Vercel Blob, not in git.

## Checks

```bash
npm run check
npm test
npm run build --workspace @taste/web
```
