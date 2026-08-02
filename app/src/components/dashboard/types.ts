import type { FormEvent, ReactNode } from "react";

export type View = "overview" | "applications" | "endpoints" | "messages" | "deliveries" | "event-types" | "api-keys" | "team" | "usage" | "settings";
export type Application = { id: string; name: string; uid: string; description: string | null; created_at: string };
export type Endpoint = { id: string; application_id: string | null; name: string; provider: string; destination_url: string; signing_secret: string | null; provider_verification_required: boolean; provider_secret_hint: string | null; is_active: boolean; event_types: string[]; created_at: string };
export type EventRow = { id: string; endpoint_id: string; endpoint_name: string; application_id: string | null; message_id: string | null; direction: string; provider: string; provider_event_id: string | null; event_type: string; status: string; revenue_at_risk: number; revenue_currency: string | null; received_at: string; response_status: number | null; response_body: string | null; latency_ms: number | null; error: string | null; retry_count: number; max_retries: number; next_retry_at: string | null; last_error: string | null; cancelled_at: string | null; dead_lettered_at: string | null; attempt_count: number; request_headers: Record<string, unknown>; request_body: unknown };
export type DeliveryAttempt = { id: string; attempt_number: number; destination_url: string; request_headers: Record<string, unknown>; response_status: number | null; response_headers: Record<string, unknown>; response_body: string | null; error: string | null; latency_ms: number; created_at: string };
export type DashboardData = {
  ok: boolean; error?: string; appUrl: string; system: { queueConfigured: boolean }; usage: { periodStart: string; acceptedEvents: number; limits: { messagesPerMonth: number; apiRequestsPerMinute: number; inboundRequestsPerMinute: number; endpoints: number; teamMembers: number; payloadRetentionDays: number } };
  context: { user: { id: string; name: string; email: string }; organization: { id: string; name: string; slug: string; plan: string; role: string }; organizations: Array<{ id: string; name: string; role: string }>; project: { id: string; name: string; environment: string } };
  providers: Array<{ id: string; name: string }>;
  applications: Application[]; endpoints: Endpoint[]; events: EventRow[];
  messages: Array<{ id: string; application_id: string; event_type: string; status: string; created_at: string }>;
  eventTypes: Array<{ id: string; name: string; description: string | null; created_at: string }>;
  apiKeys: Array<{ id: string; name: string; key_prefix: string; last_used_at: string | null; revoked_at: string | null; created_at: string }>;
  members: Array<{ id: string; name: string; email: string; role: string; created_at: string }>;
  transformations: Array<{ id: string; name: string; event_type: string | null; config: { addFields?: Record<string, unknown>; removeFields?: string[]; renameFields?: Record<string, string> }; is_active: boolean }>;
  alerts: Array<{ id: string; name: string; channel: "email" | "slack" | "webhook"; destination: string; failure_threshold: number; window_minutes: number; is_active: boolean }>;
  alertNotifications: Array<{ id: string; event_id: string; status: string; response_status: number | null; error: string | null; created_at: string; rule_name: string; channel: string; event_type: string }>;
  auditLogs: Array<{ id: string; action: string; resource_type: string; resource_id: string | null; created_at: string }>;
  metrics: { totalEvents: number; deliveredEvents: number; failedEvents: number; retryingEvents: number; queuedEvents: number; processingEvents: number; deadLetteredEvents: number; oldestPendingAt: string | null; openIncidents: number; successRate: number; avgLatency: number; revenueAtRisk: Array<{ currency: string; amount: number | string }>; endpoints: number };
};
export type DashboardMutate = (path: string, body?: unknown, method?: string) => Promise<Record<string, unknown> | null>;
export type DashboardSubmit = (event: FormEvent<HTMLFormElement>, path: string, build: (form: FormData) => unknown, after?: (payload: Record<string, unknown>) => void) => Promise<void>;
export type EmptyProps = { icon: ReactNode; title: string; copy: string };