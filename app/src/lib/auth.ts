import { cookies } from "next/headers";
import { requireSql } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/security";

export const SESSION_COOKIE = "payloadgrid_session";
export const ACTIVE_ORG_COOKIE = "payloadgrid_organization";
const SESSION_DAYS = 30;
export type SessionContext = {
  user: { id: string; name: string; email: string };
  organization: { id: string; name: string; slug: string; plan: string; role: string };
  organizations: Array<{ id: string; name: string; role: string }>;
  project: { id: string; name: string; slug: string; environment: string };
};
export class AuthenticationError extends Error { status = 401; }
export class AuthorizationError extends Error { status = 403; }

export async function createSession(userId: string) { const sql = requireSql(); const token = randomToken(32); await sql`insert into sessions (user_id, token_hash, expires_at) values (${userId}, ${sha256(token)}, now() + (${SESSION_DAYS} * interval '1 day'))`; const store = await cookies(); store.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400 }); }
export async function destroySession() { const sql = requireSql(); const store = await cookies(); const token = store.get(SESSION_COOKIE)?.value; if (token) await sql`delete from sessions where token_hash = ${sha256(token)}`; store.delete(SESSION_COOKIE); store.delete(ACTIVE_ORG_COOKIE); }
export async function setActiveOrganization(organizationId: string) { const store = await cookies(); store.set(ACTIVE_ORG_COOKIE, organizationId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400 }); }

export async function getSessionContext(): Promise<SessionContext | null> {
  const store = await cookies(); const token = store.get(SESSION_COOKIE)?.value; if (!token) return null; const sql = requireSql();
  const rows = await sql`
    select u.id as user_id, u.name as user_name, u.email, o.id as organization_id, o.name as organization_name,
      o.slug as organization_slug, o.plan, om.role, p.id as project_id, p.name as project_name, p.slug as project_slug, p.environment
    from sessions s join users u on u.id = s.user_id join organization_members om on om.user_id = u.id
    join organizations o on o.id = om.organization_id join projects p on p.organization_id = o.id
    where s.token_hash = ${sha256(token)} and s.expires_at > now()
    order by om.created_at asc, p.created_at asc
  `;
  if (!rows.length) return null;
  const requested = store.get(ACTIVE_ORG_COOKIE)?.value; const row = rows.find((item) => String(item.organization_id) === requested) || rows[0];
  const organizations = Array.from(new Map(rows.map((item) => [String(item.organization_id), { id: String(item.organization_id), name: String(item.organization_name), role: String(item.role) }])).values());
  return { user: { id: String(row.user_id), name: String(row.user_name), email: String(row.email) }, organization: { id: String(row.organization_id), name: String(row.organization_name), slug: String(row.organization_slug), plan: String(row.plan), role: String(row.role) }, organizations, project: { id: String(row.project_id), name: String(row.project_name), slug: String(row.project_slug), environment: String(row.environment) } };
}
export async function requireSession() { const context = await getSessionContext(); if (!context) throw new AuthenticationError("Please sign in to continue"); return context; }
export function requireRole(context: SessionContext, roles: string[]) { if (!roles.includes(context.organization.role)) throw new AuthorizationError("You do not have permission for this action"); }
export function authErrorResponse(error: unknown) { const status = error instanceof AuthenticationError || error instanceof AuthorizationError ? error.status : 500; return { status, message: error instanceof Error ? error.message : "Request failed" }; }