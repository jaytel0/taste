# Taste Web App

Next.js hosted demo for turning uploaded reference images into a final
`SKILL.md`.

For the simple local pipeline, use the repo root command instead:

```bash
npm run taste
```

The local runner uses `packages/ai` directly and does not require Postgres,
Vercel Blob, Cron, or hosted OAuth.

## Architecture

```text
frontend -> Next API routes -> Postgres workflow jobs -> @taste/ai -> OpenRouter OAuth
                         \-> Neon Postgres state/leases
                         \-> private Vercel Blob uploads/artifacts
```

The hosted web app only accepts OpenRouter OAuth sessions. Do not add public UI
or API routes that collect individual OpenAI/Anthropic keys; direct provider
credentials belong in local tooling built on `packages/ai`.

`POST /api/runs/:runId/start` enqueues a durable workflow. `/api/jobs/drain`
claims bounded batches of jobs with database leases, retries failed jobs, and is
also invoked by Vercel Cron so killed functions can resume.

Generated artifacts are written under Vercel Blob paths like:

```text
runs/{runId}/01-corpus/images.jsonl
runs/{runId}/02-image-notes/raw/img_0001/openai_gpt-5.5.md
runs/{runId}/02-image-notes/raw/img_0001/anthropic_claude-sonnet-4-6.md
runs/{runId}/02-image-notes/synthesized/img_0001.md
runs/{runId}/03-rule-set/chunks/chunk_01-rules.md
runs/{runId}/03-rule-set/merges/merge_01_01-rules.md
runs/{runId}/03-rule-set/rule-set.md
runs/{runId}/04-skill/SKILL.md
```

During `02-image-notes/synthesized`, `SYNTHESIS_MODEL` fuses the raw analysis
outputs into one canonical note. The fusion prompt is source-neutral: it strips
raw artifact frontmatter, omits model names from analysis headings, and redacts
known source model ids from analysis text before calling the fusion model.
Stored artifact metadata still records source and synthesis model ids for
debugging.

## API Contract

All run-scoped routes after creation require the `runSecret` returned from
`POST /api/runs` in the `x-run-secret` header.

```text
GET /api/credentials/openrouter/start?returnTo=/
  Redirects to OpenRouter OAuth/PKCE. Use ?format=json to receive { url }.

GET /api/credentials/openrouter/callback
  OAuth callback. Stores credentials server-side and sets an opaque HttpOnly session cookie.

GET /api/credentials
GET /api/credentials/status
  Returns non-secret credential status.

DELETE /api/credentials
  Deletes the server-side credential session and clears the session cookie.

POST /api/runs
  body: {
    expectedImageCount?: number
  }
  Uses the active OpenRouter credential session.
  returns: { runId, runSecret, credentialMode, maxImages, maxImageBytes, acceptedTypes }

POST /api/uploads
  Vercel Blob client upload route.
  clientPayload: { runId, runSecret, uploadOrder, fileName, contentType, size }

POST /api/runs/:runId/images/complete
  Internal-only helper for trusted e2e upload registration. Requires x-internal-secret.

POST /api/runs/:runId/start
  Enqueues the workflow and kicks the worker drain.

GET|POST /api/jobs/drain
  Internal/cron worker drain. Requires x-internal-secret or CRON_SECRET bearer auth.

POST /api/runs/:runId/process
  Internal-only processing entrypoint. Requires x-internal-secret.

POST /api/runs/:runId/cancel
  Cancels the run and purges encrypted per-run AI credentials.

GET /api/runs/:runId
  Returns status, current step, progress, counters, and artifact readiness.

GET /api/runs/:runId/images
  Returns indexed images for progress thumbnails.

GET /api/runs/:runId/events?after=<id>
  Returns progress events after the given event id.

GET /api/runs/:runId/skill
  Returns the final SKILL.md once complete.
```

## Environment

```text
DATABASE_URL=...
APP_ENCRYPTION_KEY=32+ bytes or a 32-byte base64url/64-char hex key
BLOB_READ_WRITE_TOKEN=...
CRON_SECRET=16+ byte random string for Vercel Cron cleanup
INTERNAL_API_SECRET=32+ byte random string for internal-only routes
```

Optional speed/model defaults:

```text
MAX_IMAGES_PER_RUN=100
MAX_IMAGE_BYTES=10485760
ANALYSIS_MODELS=openai/gpt-5.5,anthropic/claude-sonnet-4-6
SYNTHESIS_MODEL=openai/gpt-5.5
RULE_MODEL=openai/gpt-5.5
SKILL_MODEL=openai/gpt-5.5
ANALYZE_IMAGE_CONCURRENCY=8
SYNTHESIZE_NOTE_CONCURRENCY=8
RULE_CHUNK_SIZE=10
RULE_MERGE_FAN_IN=6
WORKFLOW_DRAIN_CONCURRENCY=8
WORKFLOW_DRAIN_MAX_JOBS=24
WORKFLOW_JOB_LEASE_SECONDS=600
WORKFLOW_JOB_MAX_ATTEMPTS=6
RUN_RETENTION_HOURS=24
STALE_RUN_CREDENTIAL_TTL_MINUTES=60
CREDENTIAL_SESSION_TTL_HOURS=24
RATE_LIMIT_ENABLED=true
```

## Development

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run db:migrate --workspace @taste/web
npm run dev:web
```

Open `http://localhost:3000` and connect with OpenRouter. The main app has no
direct key entry.

## Production E2E

```bash
set -a
. .env.local
set +a
npm run e2e:prod
```

Use `TASTE_BASE_URL` to target a preview deployment.
The script requires `BLOB_READ_WRITE_TOKEN`, `INTERNAL_API_SECRET`,
and `TASTE_E2E_COOKIE` from a signed-in OpenRouter session.
Put local test images in `pipeline/taste/01-corpus/reference-images` or set
`TASTE_REFERENCE_DIR`; reference images are intentionally gitignored.
