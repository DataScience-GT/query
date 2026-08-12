import type { MetadataRoute } from "next";

const SITE = "https://datasciencegt.org";

// Public pages only. /hacklytics is the funnel and carries the highest priority
// while the edition is announced; the rest are the standing marketing pages.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/hacklytics`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/team`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/projects`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/events`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/bootcamp`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/history`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
