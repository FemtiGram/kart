import type { MetadataRoute } from "next";
import { getAllKommuner } from "@/lib/kommune-profiles";

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
    { path: "/prisvekst", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/vindkraft", priority: 0.7, changeFrequency: "weekly" as const },
    { path: "/skoler", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/helse", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/kommune", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/kilder", priority: 0.3, changeFrequency: "monthly" as const },
    { path: "/personvern", priority: 0.2, changeFrequency: "yearly" as const },
  ];

  const now = new Date();
  const staticEntries = pages.map((p) => ({
    url: `${BASE}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  // One entry per kommune profile — 357 long-tail URLs for SEO.
  const kommuneEntries = getAllKommuner().map((k) => ({
    url: `${BASE}/kommune/${k.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticEntries, ...kommuneEntries];
}
