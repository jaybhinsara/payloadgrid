import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn("DATABASE_URL is not set. API routes will return setup errors until Neon is configured.");
}

export const sql = databaseUrl ? neon(databaseUrl) : null;

export function requireSql() {
  if (!sql) {
    throw new Error("DATABASE_URL is not configured. Add your Neon connection string to .env.local and Vercel environment variables.");
  }
  return sql;
}
