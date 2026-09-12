import { appUrl } from "@/lib/constants";
import { requireSql } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/security";

export function emailDeliveryConfigured() { return Boolean(process.env.RESEND_API_KEY && process.env.PAYLOADGRID_AUTH_FROM); }
export const EMAIL_VERIFICATION_HOURS = 24;
export const PASSWORD_RESET_HOURS = 1;
export async function createAuthToken(userId: string, kind: "verify_email" | "reset_password", hours: number) {
  const sql = requireSql(); const token = randomToken(32);
  await sql`
    insert into auth_tokens (user_id, kind, token_hash, expires_at)
    values (${userId}, ${kind}, ${sha256(token)}, now() + (${hours} * interval '1 hour'))
    on conflict (user_id, kind) do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at, used_at = null, created_at = now()
  `;
  return token;
}
export async function sendAuthEmail(to: string, kind: "verify_email" | "reset_password", token: string) {
  if (!emailDeliveryConfigured()) return false;
  const verify = kind === "verify_email"; const path = verify ? "/verify-email/confirm" : "/reset-password";
  const url = `${appUrl()}${path}?token=${encodeURIComponent(token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.PAYLOADGRID_AUTH_FROM, to: [to], subject: verify ? "Verify your PayloadGrid email" : "Reset your PayloadGrid password", html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h1>${verify ? "Verify your email" : "Reset your password"}</h1><p>${verify ? `Confirm this address within ${EMAIL_VERIFICATION_HOURS} hours to activate your PayloadGrid workspace.` : `Use this link to choose a new password. It expires in ${PASSWORD_RESET_HOURS} hour.`}</p><p><a href="${url}" style="display:inline-block;padding:12px 18px;background:#ef5b46;color:white;text-decoration:none;border-radius:6px">${verify ? "Verify email" : "Reset password"}</a></p><p>If you did not request this, ignore this message.</p></div>` })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`Resend API request failed (${response.status}) for ${kind}`, body);
  }
  return response.ok;
}
