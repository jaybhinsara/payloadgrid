import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("blog storage is additive and preserves old slugs", async () => {
  const schema = await read("db/schema.sql");
  for (const table of ["blog_posts", "blog_slug_redirects", "platform_audit_logs"]) {
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
  assert.doesNotMatch(collection + article, /insert into blog_post_revisions/);
  assert.match(article, /toIsoTimestamp\(current\.published_at\)/);
  assert.doesNotMatch(article, /String\(current\.published_at\)/);
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
  assert.match(article, /type: "article"/);
  assert.match(article, /cover_image_url/);
  assert.match(article, /permanentRedirect/);
  assert.match(rss, /application\/rss\+xml/);
  assert.match(rss, /xmlns:atom/);
  assert.match(rss, /lastBuildDate/);
  assert.match(sitemap, /listPublishedPosts/);
  assert.match(sitemap, /dynamic = "force-dynamic"/);
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

test("blog task lists keep compact checkboxes aligned with their labels", async () => {
  const [styles, markdown] = await Promise.all([read("src/app/globals.css"), read("src/components/blog/markdown-content.tsx")]);
  assert.match(styles, /ul\.contains-task-list[^}]*list-style:\s*none/);
  assert.match(styles, /\.task-list-item[^}]*display:\s*flex/);
  assert.match(styles, /\.task-list-item input\[type="checkbox"\][^}]*width:\s*17px/);
  assert.match(styles, /\.task-list-item input\[type="checkbox"\][^}]*min-height:\s*17px/);
  assert.match(markdown, /defaultChecked=\{Boolean\(checked\)\}/);
  assert.match(markdown, /disabled:\s*_disabled/);
});

test("publishing UI lives only in the separate platform admin", async () => {
  const [dashboard, editor] = await Promise.all([
    read("src/components/dashboard/dashboard-client.tsx"),
    read("src/components/dashboard/views/blog.tsx")
  ]);
  assert.match(dashboard, /data\.system\.admin \? <a className="sidebar-admin" href="\/admin"/);
  assert.doesNotMatch(dashboard, /view === "blog"|<BlogView/);
  assert.doesNotMatch(editor, /Revision history|recent snapshots|Restore/);
  assert.match(editor, /SEO metadata/);
  assert.match(editor, /Upload image/);
});
