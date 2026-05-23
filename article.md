# Creating a Design Skill From References

## 1. Curate References

This is the most important part of the process. The quality of the references drives the quality of the final skill.

High-resolution images help a lot. I have also found that close-up crops often work better than full screens, because they let the model focus on specific visual details instead of trying to parse an entire interface at once.

The goal is not to collect random inspiration. The goal is to build a tight corpus of examples with repeated visual signals: layout, spacing, color, type, texture, composition, density, and hierarchy.

## 2. Index the Corpus

Each image is indexed, deduped, and assigned a stable ID. Then each image is read independently by two vision models: Vision Model A and Vision Model B.

I have found the best results here with GPT-5.5 and Opus 4.7. Yes, this is expensive, and maybe overkill, but you only need to do it once. After that, you can use the resulting skill with cheaper models.

Using two independent vision models matters because each model notices different things. Their training data, biases, and visual instincts are different, so they tend to call out different parts of the design.

In practice, I find Opus much better at frontend design out of the box, while GPT-5.5 is often weaker at generating frontend UI. But for vision analysis of design, GPT-5.5 is extremely good at recognizing and naming niche visual principles.

The key is to tell the models not to analyze functionality. They should ignore what the screen does and focus only on visual evidence: layout, spacing, color, type, texture, composition, rhythm, density, and hierarchy.

At the end of this step, the file structure looks roughly like this:

```text
01-corpus/
  images.jsonl
  reference-images/
    image-01.png
    image-02.png
    image-03.png

02-image-notes/
  raw/
    image-01/
      opus-4-7-analysis.md
      gpt-5-5-analysis.md
    image-02/
      opus-4-7-analysis.md
      gpt-5-5-analysis.md
    image-03/
      opus-4-7-analysis.md
      gpt-5-5-analysis.md
```

## 3. Fuse and Chunk

For each image, the two model analyses are fused into one synthesized analysis. This keeps the useful agreement, resolves contradictions, and removes noisy one-off observations.

GPT-5.5 is used for fusion. To prevent it from favoring its own analysis, the two inputs are anonymized before they are sent into the fusion prompt. The model sees them as `Analysis 1` and `Analysis 2`, not as "GPT said this" and "Opus said that."

After fusion, we have one synthesized analysis per reference image. Now the goal is to combine all of those into a single rule set.

This is where chunking matters. If you ask one model to combine 100 image analyses at once, the result becomes too broad. It summarizes instead of preserving the granular design rules we actually want.

The solution is simple: chunk the fused analyses into smaller groups. Each group gets merged into a chunk-level synthesis, usually from around 6 to 8 image notes at a time.

That gives us a smaller set of chunked syntheses. Then one final model pass fuses those chunks into a single Markdown rule set.

At the end of this step, the rule-set folder looks roughly like this:

```text
03-rule-set/
  chunks/
    chunk-01-rules.md   # rules extracted from a small group of fused image notes
    chunk-02-rules.md
    chunk-03-rules.md

  merges/
    merge-01-rules.md   # intermediate fusions, only needed for larger corpuses
    merge-02-rules.md

  rule-set.md           # final fused rule set before skill writing
```

## 4. Write the Skill

Once we have the final rule set, we create version 1.0 of the skill.

The skill writer turns the rule set into concrete instructions. It preserves exact visual constraints, uses imperative language, avoids vague taste words, enforces content neutrality, and includes anti-collapse guardrails.

Instead of learning from the references and saying, "Make it luxury, editorial, premium, and tasteful," the skill says things like:

- Use neutral sans-serif typography.
- Keep accent color localized.
- Avoid beige luxury-commerce defaults.
- Use soft shadows, minimal borders, and restrained surface contrast.

This is the key idea: the skill should not rely on high-level aesthetic labels. It should give the model specific visual rules, because specific rules leave fewer gaps for the model to fill with stereotypes.
