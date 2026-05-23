import type { MetadataRoute } from "next";

const SITE_URL = "https://taste.jaytel.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date("2026-05-23"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/lab`,
      lastModified: new Date("2026-05-23"),
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];
}
