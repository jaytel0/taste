import type { Metadata } from "next";

import { DEFAULT_SKILL } from "@/lab/default-skill";
import { SkillLabClient } from "./SkillLabClient";

const description = "Compare generated UI candidates and record preference votes for a Taste skill.";

export const metadata: Metadata = {
  title: "Taste Skill Lab",
  description,
  alternates: {
    canonical: "/lab",
  },
  openGraph: {
    title: "Taste Skill Lab",
    description,
    url: "/lab",
    images: [
      {
        url: "/taste-og.png",
        width: 1200,
        height: 630,
        alt: "Taste Skill Lab",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Taste Skill Lab",
    description,
    images: ["/taste-og.png"],
  },
};

export default async function LabPage() {
  return <SkillLabClient defaultSkill={DEFAULT_SKILL} />;
}
