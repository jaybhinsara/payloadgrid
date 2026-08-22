import { existsSync } from "node:fs";
import process from "node:process";

if (existsSync(".env.local") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env.local");

const required = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "PAYLOADGRID_APP_URL",
  "NEXT_PUBLIC_LEGAL_OPERATOR_NAME",
  "PAYLOADGRID_ENCRYPTION_KEY",
  "PAYLOADGRID_EMBED_SECRET",
  "CRON_SECRET",
  "QSTASH_TOKEN",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "RESEND_API_KEY",
  "PAYLOADGRID_AUTH_FROM",
  "PAYLOADGRID_ALERT_FROM",
  "PAYLOADGRID_ADMIN_EMAILS",
  "BLOB_READ_WRITE_TOKEN"
];

const errors = [];
for (const name of required) if (!process.env[name]?.trim()) errors.push(`${name} is required`);

for (const name of ["NEXT_PUBLIC_SITE_URL", "PAYLOADGRID_APP_URL"]) {
  const value = process.env[name]?.trim();
  if (value && (!value.startsWith("https://") || value.endsWith("/"))) errors.push(`${name} must be an HTTPS URL without a trailing slash`);
}

const encryptionKey = process.env.PAYLOADGRID_ENCRYPTION_KEY?.trim() || "";
if (encryptionKey) {
  const key = /^[a-f0-9]{64}$/i.test(encryptionKey) ? Buffer.from(encryptionKey, "hex") : Buffer.from(encryptionKey, "base64");
  if (key.length !== 32) errors.push("PAYLOADGRID_ENCRYPTION_KEY must decode to exactly 32 bytes");
}

for (const name of ["PAYLOADGRID_EMBED_SECRET", "CRON_SECRET"]) {
  const value = process.env[name]?.trim() || "";
  if (value && value.length < 32) errors.push(`${name} must contain at least 32 characters`);
}

if (!process.env.PAYLOADGRID_INCIDENT_ALERT_TO?.trim() && !process.env.PAYLOADGRID_INCIDENT_ALERT_WEBHOOK?.trim()) {
  errors.push("Configure PAYLOADGRID_INCIDENT_ALERT_TO or PAYLOADGRID_INCIDENT_ALERT_WEBHOOK");
}

if (process.env.PAYMENTS_ENABLED?.trim().toLowerCase() === "true") {
  for (const name of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "NEXT_PUBLIC_RAZORPAY_KEY_ID"]) {
    if (!process.env[name]?.trim()) errors.push(`${name} is required when PAYMENTS_ENABLED=true`);
  }
  if (process.env.RAZORPAY_KEY_ID?.trim() !== process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim()) errors.push("Public and server Razorpay key IDs must match");
}

if (errors.length) {
  console.error("Production configuration is invalid:\n" + errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Production configuration passed ${required.length} required-variable checks.`);
