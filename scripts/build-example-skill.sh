#!/usr/bin/env bash
# Build the example taste skill download bundle served by the web app.
#
# Produces:
#   apps/web/public/taste-design.zip
#     └── taste-design/
#         └── SKILL.md
#
# The folder name inside the zip matches the skill's `name` from the SKILL.md
# YAML frontmatter, which is the format Claude Skills expects on disk. Run
# this whenever pipeline/taste/taste-skill/SKILL.md changes. Also wired into
# apps/web's prebuild so production deploys always re-bake the zip.

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
src="$repo_root/pipeline/taste/taste-skill/SKILL.md"
out="$repo_root/apps/web/public/taste-design.zip"
skill_name="taste-design"

if [ ! -f "$src" ]; then
  echo "build-example-skill: source not found at $src" >&2
  exit 1
fi

# Verify the skill name in the YAML still matches the folder name we're baking
# into the zip — drift here would silently ship a wrong-shaped bundle.
yaml_name="$(awk '/^name:/{gsub(/"/,"",$2); print $2; exit}' "$src")"
if [ "$yaml_name" != "$skill_name" ]; then
  echo "build-example-skill: YAML name ($yaml_name) ≠ expected ($skill_name)" >&2
  echo "  update scripts/build-example-skill.sh if the skill was renamed." >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/$skill_name"
cp "$src" "$tmp/$skill_name/SKILL.md"

mkdir -p "$(dirname "$out")"
rm -f "$out"
(cd "$tmp" && zip -qr "$out" "$skill_name")

echo "build-example-skill: wrote $out"
