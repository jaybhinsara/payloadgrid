import { requireSql } from "@/lib/db";
import { randomToken, slugify } from "@/lib/security";

export type PendingInvitation = {
  id: string;
  organizationId: string;
  email: string;
  role: string;
};

export async function findInvitationById(invitationId: string, email: string): Promise<PendingInvitation | null> {
  const sql = requireSql();
  const [invitation] = await sql`
    select id, organization_id, email, role
    from organization_invitations
    where id = ${invitationId}
      and lower(email) = ${email.toLowerCase()}
      and accepted_at is null
      and expires_at > now()
    limit 1
  `;
  if (!invitation) return null;
  return {
    id: String(invitation.id),
    organizationId: String(invitation.organization_id),
    email: String(invitation.email),
    role: String(invitation.role)
  };
}

export async function acceptInvitation(userId: string, invitation: PendingInvitation) {
  const sql = requireSql();
  // A single statement so the membership insert and invitation update either both
  // land or neither does (Postgres always runs writable CTEs to completion even
  // when their output isn't selected downstream).
  await sql`
    with membership as (
      insert into organization_members (organization_id, user_id, role)
      values (${invitation.organizationId}, ${userId}, ${invitation.role})
      on conflict (organization_id, user_id) do nothing
    )
    update organization_invitations set accepted_at = now()
    where id = ${invitation.id} and accepted_at is null
  `;
  return invitation.organizationId;
}

export async function createDefaultWorkspace(userId: string, workspaceName: string) {
  const sql = requireSql();
  const cleanName = workspaceName.trim().slice(0, 100) || "My workspace";
  const suffix = randomToken(5).toLowerCase();
  const organizationSlug = `${slugify(cleanName)}-${suffix}`;
  const projectSlug = `${organizationSlug}-production`;
  const applicationUid = `app_${randomToken(12)}`;
  // Chained as CTEs so the whole workspace (org, membership, project, application,
  // default event type) is created atomically in one round trip: previously these
  // were five separate inserts, and a failure partway through left the user with
  // no organization/project and no way to retry (their email was already taken).
  const [result] = await sql`
    with org as (
      insert into organizations (name, slug) values (${cleanName}, ${organizationSlug}) returning id
    ), member as (
      insert into organization_members (organization_id, user_id, role)
      select id, ${userId}, 'owner' from org
    ), project as (
      insert into projects (organization_id, name, slug, environment)
      select id, 'Production', ${projectSlug}, 'production' from org
      returning id
    ), application as (
      insert into applications (project_id, name, uid, description)
      select id, 'My application', ${applicationUid}, 'Your first PayloadGrid application' from project
    ), event_type as (
      insert into event_types (project_id, name, description)
      select id, 'order.created', 'Example event type; rename or add your own' from project
      on conflict do nothing
    )
    select (select id from org) as organization_id, (select id from project) as project_id
  `;
  return { organizationId: String(result.organization_id), projectId: String(result.project_id) };
}
