import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("public navigation reuses the secure authentication session", async () => {
  const [auth, header, client] = await Promise.all([
    read("../src/lib/auth.ts"),
    read("../src/components/marketing/public-header.tsx"),
    read("../src/components/marketing/public-header-client.tsx")
  ]);

  assert.match(auth, /SESSION_COOKIE = "payloadgrid_session"/);
  assert.match(auth, /httpOnly: true/);
  assert.match(auth, /sameSite: "lax"/);
  assert.match(auth, /maxAge: SESSION_DAYS \* 86400/);
  assert.match(header, /hasSessionCookie/);
  assert.match(client, /signedIn/);
  assert.match(client, /href="\/dashboard"/);
  assert.match(client, /> Dashboard</);
});

test("homepage calls to action reflect a returning session", async () => {
  const [page, hero, growth] = await Promise.all([
    read("../src/app/page.tsx"),
    read("../src/components/marketing/hero.tsx"),
    read("../src/components/marketing/growth.tsx")
  ]);

  assert.match(page, /const signedIn = await hasSessionCookie\(\)/);
  assert.match(page, /<MarketingHero signedIn=\{signedIn\}/);
  assert.match(page, /<FinalCta signedIn=\{signedIn\}/);
  assert.match(hero, /Open dashboard/);
  assert.match(growth, /Return to operations/);
});
