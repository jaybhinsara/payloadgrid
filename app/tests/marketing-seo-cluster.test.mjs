import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const routes = ["webhook-service", "webhook-delivery", "webhook-gateway", "webhook-testing", "webhook-retries"];
const [home, layout, sitemap, sections, solutionPage, ...pages] = await Promise.all([
  read("../src/app/page.tsx"), read("../src/app/layout.tsx"), read("../src/app/sitemap.ts"),
  read("../src/components/marketing/seo-sections.tsx"), read("../src/components/marketing/solution-page.tsx"),
  ...routes.map((route) => read(`../src/app/${route}/page.tsx`))
]);

test("homepage targets the webhook category without unsupported social proof", () => {
  assert.match(home, /Webhook Service, Gateway and Delivery Platform/);
  assert.match(home, /FAQPage/);
  assert.match(home, /SolutionDirectory/);
  assert.match(layout, /webhook testing/);
  assert.doesNotMatch(home + sections, /billions of webhooks|Fortune 500|99\.99%|trusted by/i);
});

test("search-intent pages are canonical and included in discovery", () => {
  routes.forEach((route, index) => {
    assert.match(pages[index], new RegExp(`path: "\\/${route}"`));
    assert.match(sitemap, new RegExp(`"\\/${route}"`));
  });
});

test("solution pages expose crawlable content and FAQ structured data", () => {
  assert.match(solutionPage, /application\/ld\+json/);
  assert.match(solutionPage, /FAQPage/);
  assert.match(solutionPage, /Frequently asked/);
  assert.match(solutionPage, /Related webhook workflows/);
  assert.match(sections, /What is a webhook service\?/);
});
