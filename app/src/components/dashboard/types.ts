import type { FormEvent, ReactNode } from "react";

export type View = "overview" | "applications" | "endpoints" | "messages" | "deliveries" | "event-types" | "api-keys" | "team" | "settings";
export type Application = { id: string; name: string; uid: string; description: string | null; created_at: string };
export type Endpoint = { id: string; application_id: string | null; name: string; provider: string; destination_url: string; signing_secret: string | null; is_active: boolean; event_types: string[]; created_at: string };
export type EventRow = { id: string; endpoint_id: string; application_id: string | null; message_id: string | null; direction: string; provider: string; provider_event_id: string | null; event_type: string; status: string; revenue_at_risk: number; received_at: string; response_status: number | null; response_body: string | null; latency_ms: number | null; error: string | null; retry_count: number; max_retries: number; next_retry_at: string | null; last_error: string | null; attempt_count: number; request_headers: Record<string, unknown>; request_body: unknown };
export type DashboardData = {
  ok: boolean; error?: string; appUrl: string;
  context: { user: { id: string; name: string; email: string }; organization: { id: string; name: string; slug: string; plan: string; role: string }; organizations: Array<{ id: string; name: string; role: string }>; project: { id: string; name: string; environment: string } };
  providers: Array<{ id: string; name: string }>;
  applications: Application[]; endpoints: Endpoint[]; events: EventRow[];
  messages: Array<{ id: string; application_id: string; event_type: string; status: string; created_at: string }>;
  eventTypes: Array<{ id: string; name: string; description: string | null; created_at: string }>;
  apiKeys: Array<{ id: string; name: string; key_prefix: string; last_used_at: string | null; revoked_at: string | null; created_at: string }>;
  members: Array<{ id: string; name: string; email: string; role: string; created_at: string }>;
  transformations: Array<{ id: string; name: string; event_type: string | null; config: Record<string, unknown>; is_active: boolean }>;
  alerts: Array<{ id: string; name: string; channel: string; destination: string; failure_threshold: number; is_active: boolean }>;
  auditLogs: Array<{ id: string; action: string; resource_type: string; resource_id: string | null; created_at: string }>;
  metrics: { totalEvents: number; deliveredEvents: number; failedEvents: number; retryingEvents: number; openIncidents: number; successRate: number; avgLatency: number; revenueAtRisk: number; endpoints: number };
};
export type DashboardSubmit = (event: FormEvent<HTMLFormElement>, path: string, build: (form: FormData) => unknown, after?: (payload: Record<string, unknown>) => void) => Promise<void>;
export type EmptyProps = { icon: ReactNode; title: string; copy: string };