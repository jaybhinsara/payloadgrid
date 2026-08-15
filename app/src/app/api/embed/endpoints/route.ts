import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSafeDestinationUrl } from "@/lib/destination-security";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";
import { verifyEmbedToken, type EmbedPermission } from "@/lib/embed";
import { planLimits, UsageLimitError } from "@/lib/limits";
import { randomToken } from "@/lib/security";

const createSchema = z.object({ name: z.string().trim().min(2).max(80), destinationUrl: z.string().url().max(500), eventTypes: z.array(z.string().min(1).max(120)).max(30).default([]) });
const updateSchema = z.object({ endpointId: z.string().uuid(), action: z.enum(["subscriptions", "rotate"]), eventTypes: z.array(z.string().min(1).max(120)).max(30).optional() });
function claims(request: Request, permission: EmbedPermission) {
  const token = request.headers.get("authorization")?.replace(/^Embed\s+/i, "") || new URL(request.url).searchParams.get("token") || "";
  const value = verifyEmbedToken(token);
  return value?.permissions.includes(permission) ? value : null;
}
export async function GET(request: Request) {
  const value = claims(request, "endpoints:read"); if (!value) return NextResponse.json({ ok: false, error: "Embed token cannot read endpoints" }, { status: 403 }); const sql = requireSql();
  const endpoints = await sql`select ep.id, ep.name, ep.destination_url, ep.is_active, ep.delivery_header_names, coalesce(array_agg(s.event_type) filter (where s.event_type is not null),'{}') event_types from endpoints ep left join endpoint_subscriptions s on s.endpoint_id=ep.id where ep.project_id=${value.projectId} and ep.application_id=${value.applicationId} and ep.deleted_at is null group by ep.id order by ep.created_at desc`;
  return NextResponse.json({ ok: true, endpoints });
}
export async function POST(request: Request) {
  const value = claims(request, "endpoints:write"); if (!value) return NextResponse.json({ ok: false, error: "Embed token cannot create endpoints" }, { status: 403 });
  try { const body=createSchema.parse(await request.json()); const destination=await assertSafeDestinationUrl(body.destinationUrl); const sql=requireSql(); const [project]=await sql`select p.organization_id, o.plan from projects p join organizations o on o.id=p.organization_id where p.id=${value.projectId}`; if(!project)return NextResponse.json({ok:false,error:"Project not found"},{status:404}); const limits=planLimits(String(project.plan)); const [count]=await sql`select count(*)::int count from endpoints where project_id=${value.projectId} and deleted_at is null`; if(Number(count.count)>=limits.endpoints)throw new UsageLimitError(`Current plan supports up to ${limits.endpoints} endpoints per project`); const secret=`whsec_${randomToken(24)}`; const [endpoint]=await sql`insert into endpoints (project_id,application_id,name,provider,destination_url,signing_secret) values (${value.projectId},${value.applicationId},${body.name},'custom',${destination},${secret}) returning id,name,destination_url,is_active`; for(const eventType of [...new Set(body.eventTypes)]) await sql`insert into endpoint_subscriptions(endpoint_id,event_type) values (${endpoint.id},${eventType}) on conflict do nothing`; await writeAudit(String(project.organization_id),null,"embed.endpoint_created","endpoint",String(endpoint.id),{applicationId:value.applicationId}); return NextResponse.json({ok:true,endpoint,signingSecret:secret},{status:201}); }
  catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Endpoint could not be created"},{status:error instanceof UsageLimitError?error.status:400});}
}
export async function PATCH(request: Request) {
  try { const body=updateSchema.parse(await request.json()); const permission:EmbedPermission=body.action==="rotate"?"secrets:rotate":"subscriptions:write"; const value=claims(request,permission); if(!value)return NextResponse.json({ok:false,error:`Embed token cannot ${body.action}`},{status:403}); const sql=requireSql(); const [endpoint]=await sql`select ep.id,p.organization_id from endpoints ep join projects p on p.id=ep.project_id where ep.id=${body.endpointId} and ep.project_id=${value.projectId} and ep.application_id=${value.applicationId} and ep.deleted_at is null`; if(!endpoint)return NextResponse.json({ok:false,error:"Endpoint not found"},{status:404}); if(body.action==="subscriptions"){await sql`delete from endpoint_subscriptions where endpoint_id=${body.endpointId}`; for(const eventType of [...new Set(body.eventTypes||[])])await sql`insert into endpoint_subscriptions(endpoint_id,event_type) values (${body.endpointId},${eventType}) on conflict do nothing`; await writeAudit(String(endpoint.organization_id),null,"embed.endpoint_subscriptions_updated","endpoint",body.endpointId,{eventTypes:body.eventTypes||[]}); return NextResponse.json({ok:true});} const secret=`whsec_${randomToken(24)}`; await sql`update endpoints set previous_signing_secret=signing_secret,previous_signing_secret_expires_at=now()+interval '24 hours',signing_secret=${secret},updated_at=now() where id=${body.endpointId}`; await writeAudit(String(endpoint.organization_id),null,"embed.endpoint_secret_rotated","endpoint",body.endpointId); return NextResponse.json({ok:true,signingSecret:secret,previousValidForHours:24}); }
  catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Endpoint update failed"},{status:400});}
}
