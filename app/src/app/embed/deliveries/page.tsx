import type { Metadata } from "next";
import { EmbedDeliveryTable, type EmbeddedEvent } from "@/components/embed-delivery-table";
import { EmbedEndpointManager } from "@/components/embed-endpoint-manager";
import { verifyEmbedToken } from "@/lib/embed";
import { requireSql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery history", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function EmbeddedDeliveries({ searchParams }: { searchParams: Promise<{ token?: string; view?: string }> }) {
  const parameters = await searchParams;
  const token = parameters.token || "";
  const view = parameters.view === "endpoints" || parameters.view === "deliveries" ? parameters.view : "portal";
  const claims = verifyEmbedToken(token);
  if (!claims) return <main className="embed-shell"><section className="embed-error"><h1>Link expired</h1><p>Request a fresh delivery-history link from the host application.</p></section></main>;
  const sql = requireSql();
  const [application] = await sql`
    select a.name from applications a join projects p on p.id=a.project_id join organizations o on o.id=p.organization_id
    where a.id = ${claims.applicationId} and a.project_id = ${claims.projectId} and o.suspended_at is null limit 1
  `;
  if (!application) return <main className="embed-shell"><section className="embed-error"><h1>Application unavailable</h1></section></main>;
  const events = await sql`
    select e.id, e.event_type, e.status, e.is_simulation, e.received_at, ep.name as endpoint_name,
      latest.response_status, latest.latency_ms
    from webhook_events e join endpoints ep on ep.id = e.endpoint_id
    left join lateral (select response_status, latency_ms from delivery_attempts where event_id = e.id order by created_at desc limit 1) latest on true
    where ep.project_id = ${claims.projectId} and e.application_id = ${claims.applicationId}
    order by e.received_at desc limit 50
  `;
  const tableEvents: EmbeddedEvent[] = events.map((event) => ({
    id: String(event.id), eventType: String(event.event_type), endpointName: String(event.endpoint_name), status: String(event.status),
    responseStatus: event.response_status ? Number(event.response_status) : null,
    latencyMs: event.latency_ms ? Number(event.latency_ms) : null,
    receivedAt: String(event.received_at), simulation: Boolean(event.is_simulation)
  }));
  const showDeliveries = view !== "endpoints" && claims.permissions.includes("deliveries:read");
  const showEndpoints = view !== "deliveries" && claims.permissions.includes("endpoints:read");
  return <main className="embed-shell"><header><div><span>PAYLOADGRID CUSTOMER PORTAL</span><h1>{String(application.name)}</h1></div><i>Permission scoped</i></header>{showDeliveries?<EmbedDeliveryTable initialEvents={tableEvents} token={token} canReplay={claims.permissions.includes("deliveries:replay")} />:null}{showEndpoints?<EmbedEndpointManager token={token} canCreate={claims.permissions.includes("endpoints:write")} canSubscribe={claims.permissions.includes("subscriptions:write")} canRotate={claims.permissions.includes("secrets:rotate")} />:null}</main>;
}
