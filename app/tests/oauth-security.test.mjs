import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const oauth = await readFile(new URL("../src/lib/oauth.ts", import.meta.url), "utf8");
const callback = await readFile(new URL("../src/app/api/auth/oauth/[provider]/callback/route.ts", import.meta.url), "utf8");
const login = await readFile(new URL("../src/app/api/auth/login/route.ts", import.meta.url), "utf8");
const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");

test("OAuth state is hashed, short lived, and consumed once", () => {
  assert.match(oauth, /state_hash, provider, code_verifier, nonce/);
  assert.match(oauth, /sha256\(state\)/);
  assert.match(oauth, /now\(\) \+ interval '10 minutes'/);
  assert.match(oauth, /delete from oauth_states[\s\S]*returning code_verifier/);
});

test("Google and GitHub use PKCE and OAuth redirects are constrained", () => {
  assert.match(oauth, /OAUTH_PROVIDERS = \["google", "github"\]/);
  assert.match(oauth, /code_challenge: pkceChallenge/);
  assert.match(oauth, /code_challenge_method: "S256"/);
  assert.match(oauth, /value\.startsWith\("\/"\) && !value\.startsWith\("\/\/"\)/);
});

test("provider identities require verified email and stable IDs", () => {
  assert.match(oauth, /payload\.email_verified !== true/);
  assert.match(oauth, /item\.primary === true && item\.verified === true/);
  assert.match(oauth, /providerUserId: String\(user\.id\)/);
  assert.match(oauth, /providerUserId: payload\.sub/);
});

test("Google identity tokens validate signatures and nonce", () => {
  assert.equal((oauth.match(/jwtVerify\(/g) || []).length, 1);
  assert.equal((oauth.match(/payload\.nonce !== state\.nonce/g) || []).length, 1);
  assert.match(oauth, /createRemoteJWKSet\(new URL\("https:\/\/www\.googleapis\.com\/oauth2\/v3\/certs"\)\)/);
});

test("OAuth schema stores linked identities without raw invitation tokens", () => {
  assert.match(schema, /unique \(provider, provider_user_id\)/);
  assert.match(schema, /unique \(user_id, provider\)/);
  assert.match(schema, /provider in \('google', 'github'\)/);
  assert.match(schema, /invitation_id uuid/);
  assert.doesNotMatch(schema, /invite_token text/);
  assert.match(schema, /password_hash text,/);
});

test("OAuth callback supports Google and GitHub GET redirects only", () => {
  assert.match(callback, /export async function GET/);
  assert.doesNotMatch(callback, /export async function POST/);
});

test("password login rejects provider-only accounts safely", () => {
  assert.match(login, /!user\.password_hash/);
});
