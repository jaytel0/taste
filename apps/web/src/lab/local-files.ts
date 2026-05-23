import path from "node:path";

function repoRoot() {
  const cwd = process.cwd();
  if (cwd.endsWith(path.join("apps", "web"))) {
    return path.resolve(cwd, "../..");
  }
  return cwd;
}

export const LOCAL_BASE_SKILL_PATH = path.join(
  repoRoot(),
  "pipeline",
  "taste",
  "04-skill",
  "SKILL.md",
);

export const LOCAL_SOURCE_RULE_SET_PATH = path.join(
  repoRoot(),
  "pipeline",
  "taste",
  "03-rule-set",
  "rule-set.md",
);
