import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("blog storage is additive and preserves revisions and old slugs", async () => {
  const schema = await read("db/schema.sql");
  for (const table of ["blog_posts", "blog_post_revisions", "blog_slug_redirects", "platform_audit_logs"]) {
    assert.match(schema, new RegExp(`create table if not exists ${table}`));
  }
  assert.match(schema, /check \(status in \('draft', 'scheduled', 'published', 'archived'\)\)/);
  assert.doesNotMatch(schema, /drop table[^;]*blog_/i);
});

test("every blog mutation requires a platform operator", async () => {
  const [collection, article, upload] = await Promise.all([
    read("src/app/api/blog/route.ts"),
    read("src/app/api/blog/[postId]/route.ts"),
    read("src/app/api/blog/upload/route.ts")
  ]);
  for (const route of [collection, article, upload]) {
    assert.match(route, /requireSession\(\)/);
    assert.match(route, /requirePlatformOperator\(context\)/);
  }
  assert.match(upload, /BLOB_READ_WRITE_TOKEN/);
  assert.match(upload, /4 \* 1024 \* 1024/);
  assert.match(upload, /image\/webp/);
  assert.match(collection, /writePlatformAudit/);
  assert.match(article, /writePlatformAudit/);
  assert.doesNotMatch(collection + article, /writeAudit\(context\.organization\.id/);
});

test("public blog exposes only due published content with SEO discovery", async () => {
  const [repository, page, article, rss, sitemap] = await Promise.all([
    read("src/lib/blog.ts"),
    read("src/app/blog/page.tsx"),
    read("src/app/blog/[slug]/page.tsx"),
    read("src/app/blog/rss.xml/route.ts"),
    read("src/app/sitemap.ts")
  ]);
  assert.match(repository, /bp\.published_at <= now\(\)/);
  assert.match(repository, /bp\.status = 'scheduled'/);
  assert.match(page, /publicMetadata\(/);
  assert.match(article, /Article/);
  assert.match(article, /BreadcrumbList/);
  assert.match(article, /permanentRedirect/);
  assert.match(rss, /application\/rss\+xml/);
  assert.match(sitemap, /listPublishedPosts/);
  assert.match(sitemap, /\/blog\/\$\{post\.slug\}/);
});

test("markdown rendering does not enable raw HTML", async () => {
  const [markdown, toolbar] = await Promise.all([read("src/components/blog/markdown-content.tsx"), read("src/components/blog/markdown-toolbar.tsx")]);
  assert.match(markdown, /ReactMarkdown/);
  assert.match(markdown, /remarkGfm/);
  assert.match(markdown, /remarkUnderline/);
  assert.doesNotMatch(markdown, /rehypeRaw|dangerouslySetInnerHTML/);
  for (const action of ["Heading 2", "Bold", "Italic", "Underline", "Link", "Bulleted list", "Numbered list", "Quote", "Code", "Divider"]) assert.match(toolbar, new RegExp(action));
});

test("dashboard publishing UI is hidden from customer workspace admins", async () => {
  const [dashboard, editor] = await Promise.all([
    read("src/components/dashboard/dashboard-client.tsx"),
    read("src/components/dashboard/views/blog.tsx")
  ]);
  assert.match(dashboard, /item\.id !== "blog" \|\| data\.system\.operator/);
  assert.match(dashboard, /view === "blog" && data\.system\.operator/);
  assert.match(editor, /Revision history/);
  assert.match(editor, /SEO metadata/);
  assert.match(editor, /Upload image/);
});
