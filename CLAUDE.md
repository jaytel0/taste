# Claude Notes

Read `AGENTS.md` first. It has the setup commands, repo map, and credential
guardrails.

Default local answer:

```bash
npm install
cp .env.example .env.local
# add OPENAI_API_KEY and ANTHROPIC_API_KEY
# put JPG/PNG/WebP images in reference-images/
npm run taste
```

For this repo, keep the hosted web app OpenRouter-OAuth only. Individual
OpenAI/Anthropic keys belong in the local pipeline and `packages/ai`, not as
hosted `apps/web` UI or public API. Jaytel's checked-in example skill is
`pipeline/taste/taste-skill/SKILL.md`.
