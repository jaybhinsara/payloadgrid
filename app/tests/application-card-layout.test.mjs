import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("application card actions stay grouped across responsive layouts", async () => {
  const [view, styles] = await Promise.all([
    read("../src/components/dashboard/views/routing.tsx"),
    read("../src/app/globals.css")
  ]);
  assert.match(view, /className="resource-list application-list"/);
  assert.match(view, /className="application-actions"/);
  assert.match(styles, /\.application-list > article \{ grid-template-columns: 39px minmax\(0, 1fr\) auto/);
  assert.match(styles, /\.application-list > article > \.application-actions \{ display: flex/);
  assert.match(styles, /\.application-list > article > \.application-actions \{ grid-column: 2/);
});
