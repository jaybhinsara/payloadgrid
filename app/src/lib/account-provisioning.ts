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
  await sql`
    insert into organization_members (organization_id, user_id, role)
    values (${invitation.organizationId}, ${userId}, ${invitation.role})
    on conflict (organization_id, user_id) do nothing
  `;
  await sql`update organization_invitations set accepted_at = now() where id = ${invitation.id} and accepted_at is null`;
  return invitation.organizationId;
}

export async function createDefaultWorkspace(userId: string, workspaceName: string) {
  const sql = requireSql();
  const cleanName = workspaceName.trim().slice(0, 100) || "My workspace";
  const suffix = randomToken(5).toLowerCase();
  const organizationSlug = `${slugify(cleanName)}-${suffix}`;
  const projectSlug = `${organizationSlug}-production`;
  const [organization] = await sql`
    insert into organizations (name, slug)
    values (${cleanName}, ${organizationSlug})
    returning id
  `;
  await sql`
    insert into organization_members (organization_id, user_id, role)
    values (${organization.id}, ${userId}, 'owner')
  `;
  const [project] = await sql`
    insert into projects (organization_id, name, slug, environment)
    values (${organization.id}, 'Production', ${projectSlug}, 'production')
    returning id
  `;
  await sql`
    insert into applications (project_id, name, uid, description)
    values (${project.id}, 'My application', ${`app_${randomToken(12)}`}, 'Your first PayloadGrid application')
  `;
  await sql`
    insert into event_types (project_id, name, description)
    values (${project.id}, 'order.created', 'Example event type; rename or add your own')
    on conflict do nothing
  `;
  return { organizationId: String(organization.id), projectId: String(project.id) };
}
