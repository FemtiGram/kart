import type { MetadataRoute } from "next";

const BASE = "https://datakart.no";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" as const },
    { path: "/energi", priority: 0.9, changeFrequency: "weekly" as const },
    { path: "/magasin", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/lading", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/map", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/hytter", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/vern", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/lonn", priority: 0.7, changeFrequency: "yearly" as const },
    { path: "/bolig", priority: 0.8, changeFrequency: "yearly" as const },
    { path: "/kilder", priority: 0.3, changeFrequency: "monthly" as const },
  ];

  return pages.map((p) => ({
    url: `${BASE}${p.path}`,
    lastModified: new Date(),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
