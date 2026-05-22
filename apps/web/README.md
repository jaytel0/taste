# Web App Backend

Vercel-hosted Next.js backend for turning uploaded reference images into a final `SKILL.md`.

## Product direction

Build the existing taste pipeline into a web app.

The backend makes the current linear workflow usable from a browser:

1. Add and manage reference images.
2. Index the image corpus.
3. Run model analysis for each image.
4. Review raw analyses and synthesized image notes.
5. Generate and edit the visual rule set.
6. Generate the final taste skill.
7. Run benchmark trials and inspect outputs.

The frontend contract is intentionally small: create a run with a user-provided AI Gateway token, upload reference images, start the run, poll progress, and fetch the final skill.

## Architecture

```text
frontend -> Next API routes -> Inngest jobs -> @taste/ai -> Vercel AI Gateway
                         \-> Postgres state
                         \-> Vercel Blob uploads/artifacts
```

Generated artifacts preserve the original pipeline shape under Blob paths like:

```text
runs/{runId}/01-corpus/images.jsonl
runs/{runId}/02-image-notes/raw/img_0001/openai_gpt-5.5.md
runs/{runId}/02-image-notes/raw/img_0001/anthropic_claude-sonnet-4.6.md
runs/{runId}/02-image-notes/synthesized/img_0001.md
runs/{runId}/03-rule-set/rule-set.md
runs/{runId}/04-skill/SKILL.md
```

## API contract

All run-scoped routes after creation require the `runSecret` returned from `POST /api/runs`, either as `x-run-secret` or `?runSecret=...`.

```text
POST /api/runs
  body: { aiGatewayToken: string, expectedImageCount?: number }
  returns: { runId, runSecret, maxImages, maxImageBytes, acceptedTypes }

POST /api/uploads
  Vercel Blob client upload route.
  clientPayload: { runId, runSecret, uploadOrder, fileName, contentType, size }

POST /api/runs/:runId/cancel
  Cancels the run, marks it canceled, and purges the encrypted AI Gateway token.

POST /api/runs/:runId/images/complete
  Local/dev fallback for registering completed uploads manually.

POST /api/runs/:runId/start
  Starts the Inngest pipeline.

GET /api/runs/:runId
  Returns status, current step, progress, counters, and artifact readiness.

GET /api/runs/:runId/events?after=<id>
  Returns progress events after the given event id.

GET /api/runs/:runId/skill
  Returns the final SKILL.md once complete.
```

Reference image uploads use the Vercel Blob client upload flow from the browser. Generated text artifacts are written by the server under the same run prefix.

## Environment

```text
DATABASE_URL=...
APP_ENCRYPTION_KEY=32+ bytes or a 32-byte base64url/64-char hex key
BLOB_READ_WRITE_TOKEN=...
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...
```

Optional speed/model defaults:

```text
MAX_IMAGES_PER_RUN=100
MAX_IMAGE_BYTES=10485760
ANALYSIS_MODELS=openai/gpt-5.5,anthropic/claude-sonnet-4.6
SYNTHESIS_MODEL=openai/gpt-5.5
RULE_MODEL=openai/gpt-5.5
SKILL_MODEL=openai/gpt-5.5
ANALYZE_IMAGE_CONCURRENCY=8
SYNTHESIZE_NOTE_CONCURRENCY=8
RULE_CHUNK_SIZE=10
RULE_MERGE_FAN_IN=6
```

## Development

```bash
npm install
npm run db:migrate --workspace @taste/web
npm run dev:web
```

For local Vercel Blob upload callbacks, use a public tunnel and set `VERCEL_BLOB_CALLBACK_URL`, or use `POST /api/runs/:runId/images/complete` after uploading.
