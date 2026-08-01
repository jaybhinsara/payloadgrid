import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const pages = ["", "/docs", "/pricing", "/playground", "/security", "/status", "/about", "/contact", "/privacy", "/terms"];
export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map((path, index) => ({ url: `${SITE_URL}${path}`, changeFrequency: path === "/status" ? "daily" : "weekly", priority: index === 0 ? 1 : path === "/docs" ? 0.9 : 0.7 }));
}