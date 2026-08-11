import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("documentation uses searchable grouped articles instead of one long page", async () => {
  const [data, home, article, search] = await Promise.all([
    read("../src/lib/docs.ts"),
    read("../src/app/docs/page.tsx"),
    read("../src/components/docs/docs-article.tsx"),
    read("../src/components/docs/docs-search.tsx")
  ]);
  for (const group of ["Get started", "Build", "Operate", "Developer tools", "Administration"]) assert.match(data, new RegExp(group));
  for (const guide of ["Dashboard guide", "Receive inbound webhooks", "Controlled bulk operations", "Embedded customer portal", "Security and signature verification"]) assert.match(data, new RegExp(guide));
  assert.match(home, /DOC_GROUPS/);
  assert.match(article, /On this page/);
  assert.match(search, /Search PayloadGrid docs/);
});

test("documentation records current operational boundaries honestly", async () => {
  const data = await read("../src/lib/docs.ts");
  assert.match(data, /202 response means PayloadGrid durably accepted/);
  assert.match(data, /Maximum 500 deliveries per replay operation/);
  assert.match(data, /Maximum 5,000 cancellations per action/);
  assert.match(data, /Validation never blocks delivery/);
  assert.match(data, /Processing requests are not falsely cancelled/);
});
