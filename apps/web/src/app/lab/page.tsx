import type { Metadata } from "next";

import { DEFAULT_SKILL } from "@/lab/default-skill";

import { SkillLabClient } from "./SkillLabClient";

export const metadata: Metadata = {
  title: "Taste Skill Lab",
  description: "Run local human-preference loops over generated design skills.",
};

export default async function LabPage() {
  return <SkillLabClient defaultSkill={DEFAULT_SKILL} />;
}
