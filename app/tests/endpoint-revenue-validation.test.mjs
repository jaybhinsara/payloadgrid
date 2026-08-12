import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("endpoint creation accepts empty optional revenue configuration", async () => {
  const [createRoute, updateRoute, form] = await Promise.all([
    read("../src/app/api/endpoints/route.ts"),
    read("../src/app/api/endpoints/[endpointId]/route.ts"),
    read("../src/components/dashboard/views/routing.tsx")
  ]);
  for (const source of [createRoute, updateRoute]) {
    assert.match(source, /revenueAmountPath: z\.string\(\)\.trim\(\)\.max\(240\)\.nullable\(\)\.optional\(\)/);
    assert.match(source, /revenueCurrencyPath: z\.string\(\)\.trim\(\)\.max\(240\)\.nullable\(\)\.optional\(\)/);
    assert.match(source, /revenueFixedCurrency: z\.string\(\)\.trim\(\)\.toUpperCase\(\)\.regex\(\/\^\[A-Z\]\{3\}\$\/\)\.nullable\(\)\.optional\(\)/);
    assert.match(source, /revenueTrackingMode === "custom" && !value\.revenueAmountPath/);
  }
  assert.match(form, /revenueAmountPath: mode === "custom"[\s\S]*: null/);
});
