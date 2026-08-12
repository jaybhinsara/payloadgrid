import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("visitor-facing pages do not disclose selected infrastructure vendors", async () => {
  const sources = await Promise.all([
    read("src/app/security/page.tsx"),
    read("src/app/privacy/page.tsx"),
    read("src/components/marketing/growth.tsx"),
    read("src/lib/docs.ts")
  ]);
  const publicSource = sources.join("\n");
  assert.doesNotMatch(publicSource, /Vercel|Neon|Upstash|QStash/i);
  assert.match(publicSource, /managed cloud/i);
});
