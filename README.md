<p align="center">
  <img src="apps/web/public/taste.png" alt="Taste logo" width="96" height="96">
</p>

# Taste

Taste turns a set of reference images into a reusable `SKILL.md` for generating
clean frontend UI.

Hosted demo: `https://taste.jaytel.com`

```text
apps/web/      Next.js app, upload flow, API routes, worker runner, Skill Lab
packages/ai/   prompts, model calls, chunking, and skill-generation helpers
pipeline/      pipeline notes and the current generated taste skill
```

The hosted web app uses OpenRouter OAuth only. Direct OpenAI/Anthropic
credentials are kept out of the hosted UI and public API; use `packages/ai` as
the shared foundation for local tooling that runs with your own provider keys.

## How It Works

### 1. Curate References

Upload a tight set of reference images. High-resolution images help, and
close-up crops are often better than full screens because they make the visual
details easier to read.

The goal is not random inspiration. The useful signals are repeated examples of
layout, spacing, color, type, texture, composition, density, and hierarchy.

### 2. Index the Corpus

The app indexes every uploaded image, removes exact duplicates, and assigns
stable image ids. The current production limit is 100 images per run.

Artifacts start here:

```text
runs/{runId}/01-corpus/images.jsonl
```

### 3. Analyze Each Image

Each image is read independently by the configured vision models. The current
production defaults are:

```text
openai/gpt-5.5
anthropic/claude-sonnet-4-6
```

The prompts tell the models to ignore what the app does and focus only on
visual evidence: layout, spacing, color, type, texture, rhythm, density, and
hierarchy.

Raw notes are stored like this:

```text
runs/{runId}/02-image-notes/raw/{imageId}/{model}.md
```

### 4. Fuse and Chunk

When an image's raw analyses finish, the synthesis model fuses them into one
canonical note. The inputs are anonymized first, so the model sees source-neutral
analyses instead of provider names.

Then the synthesized notes are grouped into chunks. Each chunk becomes a small
rule synthesis. Larger runs are reduced through merge layers before producing
one final Markdown rule set.

```text
runs/{runId}/02-image-notes/synthesized/{imageId}.md
runs/{runId}/03-rule-set/chunks/{chunkId}-rules.md
runs/{runId}/03-rule-set/merges/{mergeId}-rules.md
runs/{runId}/03-rule-set/rule-set.md
```

### 5. Write the Skill

The skill writer turns the final rule set into concrete instructions. It keeps
specific visual constraints and avoids vague aesthetic labels.

Instead of saying "make it premium and tasteful," the skill says things like:

- Use neutral sans-serif typography.
- Keep accent color localized.
- Use soft shadows and minimal borders.
- Avoid beige luxury-commerce defaults.

The final artifact is:

```text
runs/{runId}/04-skill/SKILL.md
```

The current checked-in skill is
`pipeline/taste/04-skill/SKILL.md`.

### 6. Hypothesize and Improve

The `/lab` page runs an autoresearch-style preference loop over a generated
skill. It creates a baseline and variants, renders each candidate in an iframe,
records the human-picked winner, and updates the skill for the next round.

Mock mode works without a key. Real mode uses OpenRouter. The lab defaults are
`anthropic/claude-opus-4.7` for generation and `openai/gpt-5.5` for research.

## Production Shape

The hosted app stores workflow state in Postgres and writes run artifacts to
private Vercel Blob storage.

```text
browser uploads -> Next API routes -> Postgres workflow jobs
                                     -> OpenRouter OAuth session
                                     -> private Vercel Blob artifacts
```

`apps/web/src/workflow/runner.ts` owns the durable job flow. `/api/jobs/drain`
claims bounded batches with database leases, and Vercel Cron can re-enter the
drain so interrupted functions resume.

## Development

Requirements:

- Node 24
- A Postgres database
- A Vercel Blob read/write token for uploaded images and generated artifacts

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run db:migrate --workspace @taste/web
npm run dev:web
```

Set the required values in `apps/web/.env.local` before running the app:
`DATABASE_URL`, `APP_ENCRYPTION_KEY`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`,
and `INTERNAL_API_SECRET`.

Open `http://localhost:3000` and connect with OpenRouter. The `/lab` page can
run in mock mode without a key; for real lab calls, set `OPENROUTER_API_KEY` or
enter an OpenRouter key in the lab UI.

## Verification

```bash
npm run check
npm test
npm run e2e:prod
```

The production E2E script requires `BLOB_READ_WRITE_TOKEN`,
`INTERNAL_API_SECRET`, and `TASTE_E2E_COOKIE` from a signed-in OpenRouter
session. Put local test images in
`pipeline/taste/01-corpus/reference-images` or set `TASTE_REFERENCE_DIR`;
reference images are intentionally gitignored.
