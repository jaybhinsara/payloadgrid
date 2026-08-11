import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public pages declare their own canonical metadata", async () => {
  const [layout, helper, pages] = await Promise.all([
    read("src/app/layout.tsx"),
    read("src/lib/seo.ts"),
    Promise.all(["page.tsx", "pricing/page.tsx", "playground/page.tsx", "security/page.tsx", "status/page.tsx", "about/page.tsx", "contact/page.tsx", "privacy/page.tsx", "terms/page.tsx", "docs/page.tsx"].map((path) => read(`src/app/${path}`)))
  ]);
  assert.doesNotMatch(layout, /alternates:\s*\{\s*canonical:\s*"\/"/);
  assert.match(helper, /alternates:\s*\{\s*canonical:\s*path\s*\}/);
  pages.forEach((page) => assert.match(page, /publicMetadata\(/));
});

test("sitemap and documentation expose crawlable canonical routes", async () => {
  const [sitemap, docsPage, docArticle, robots] = await Promise.all([
    read("src/app/sitemap.ts"),
    read("src/app/docs/page.tsx"),
    read("src/app/docs/[slug]/page.tsx"),
    read("src/app/robots.ts")
  ]);
  assert.match(sitemap, /DOC_ARTICLES\.map/);
  assert.match(docsPage, /path:\s*"\/docs"/);
  assert.match(docArticle, /BreadcrumbList/);
  assert.match(docArticle, /TechArticle/);
  assert.match(robots, /sitemap:\s*`\$\{SITE_URL\}\/sitemap\.xml`/);
});
