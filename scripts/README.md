# Scripts

`taste-local.ts` is the local runner for generating a `SKILL.md` without the
hosted web demo.

Use it through the root npm script:

```bash
npm run taste
```

It reads images from `reference-images/` by default, calls `packages/ai`, and
writes artifacts under ignored `.taste/runs/<run-id>/`.
