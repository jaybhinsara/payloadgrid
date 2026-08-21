import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("account schema records profile, verification, and legal acceptance", async () => {
  const schema = await read("db/schema.sql");
  for (const column of ["account_type", "profile_completed_at", "terms_accepted_at", "privacy_accepted_at"]) assert.match(schema, new RegExp(column));
  for (const column of ["customer_type", "legal_name", "website", "country_code"]) assert.match(schema, new RegExp(column));
});

test("signup requires account identity and fails closed when production email is unavailable", async () => {
  const signup = await read("src/app/api/auth/signup/route.ts");
  assert.match(signup, /accountType: z\.enum\(\["individual", "company"\]\)/);
  assert.match(signup, /acceptTerms: z\.literal\("on"\)/);
  assert.match(signup, /NODE_ENV === "production" && !emailDeliveryConfigured\(\)/);
  assert.match(signup, /EMAIL_VERIFICATION_HOURS/);
});

test("sessions enforce absolute and idle expiry and maintenance removes expired records", async () => {
  const [auth, maintenance] = await Promise.all([read("src/lib/auth.ts"), read("src/app/api/cron/maintenance/route.ts")]);
  assert.match(auth, /SESSION_DAYS = 30/);
  assert.match(auth, /SESSION_IDLE_DAYS = 7/);
  assert.match(auth, /last_seen_at > now\(\) - \(\$\{SESSION_IDLE_DAYS\} \* interval '1 day'\)/);
  assert.match(maintenance, /delete from sessions/);
  assert.match(maintenance, /delete from auth_tokens/);
  assert.match(maintenance, /delete from oauth_states/);
});

test("OAuth users complete their profile before entering the dashboard", async () => {
  const [oauth, callback, dashboard] = await Promise.all([
    read("src/lib/oauth.ts"),
    read("src/app/api/auth/oauth/[provider]/callback/route.ts"),
    read("src/app/dashboard/page.tsx")
  ]);
  assert.match(oauth, /verification_required, profile_completed_at\)/);
  assert.match(oauth, /false, null\)/);
  assert.match(callback, /account\/setup/);
  assert.match(dashboard, /profileComplete/);
});

test("email verification is the only account activation channel", async () => {
  const [signup, environment, form] = await Promise.all([
    read("src/app/api/auth/signup/route.ts"),
    read(".env.example"),
    read("src/components/auth-form.tsx")
  ]);
  assert.match(signup, /emailDeliveryConfigured\(\)/);
  assert.match(signup, /EMAIL_VERIFICATION_HOURS/);
  assert.doesNotMatch(environment, /TWILIO|SMS/);
  assert.doesNotMatch(form, /Mobile number|phone/);
});
