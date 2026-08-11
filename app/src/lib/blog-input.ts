import { z } from "zod";

export const blogPostInput = z.object({
  title: z.string().trim().min(4).max(140),
  slug: z.string().trim().max(140).optional(),
  excerpt: z.string().trim().min(20).max(320),
  contentMarkdown: z.string().min(40).max(200_000),
  coverImageUrl: z.string().url().max(1000).nullable().optional(),
  coverImageAlt: z.string().trim().max(180).nullable().optional(),
  category: z.string().trim().min(2).max(60).default("Engineering"),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  status: z.enum(["draft", "scheduled", "published", "archived"]).default("draft"),
  isFeatured: z.boolean().default(false),
  seoTitle: z.string().trim().max(70).nullable().optional(),
  seoDescription: z.string().trim().max(170).nullable().optional(),
  publishedAt: z.string().datetime().nullable().optional()
}).superRefine((value, context) => {
  if (value.coverImageUrl && !value.coverImageAlt) context.addIssue({ code: "custom", path: ["coverImageAlt"], message: "Describe the cover image for accessibility" });
  if (value.status === "scheduled" && !value.publishedAt) context.addIssue({ code: "custom", path: ["publishedAt"], message: "Scheduled posts need a publication time" });
});
