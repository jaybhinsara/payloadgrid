import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/site";

export function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: { title: "PayloadGrid API", version: "1.0.0", description: "Accept outbound webhook messages and provider callbacks through PayloadGrid." },
    servers: [{ url: SITE_URL }],
    paths: {
      "/api/v1/messages": {
        post: {
          summary: "Accept an outbound message", operationId: "createMessage",
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "header", name: "Idempotency-Key", required: false, schema: { type: "string", maxLength: 200 }, description: "Unique key for one logical event." }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateMessage" } } } },
          responses: {
            "202": { description: "Message persisted and accepted for asynchronous delivery.", content: { "application/json": { schema: { $ref: "#/components/schemas/AcceptedMessage" } } } },
            "200": { description: "Idempotent duplicate; existing message returned." }, "401": { description: "Invalid or revoked API key." }, "429": { description: "Rate or monthly plan limit exceeded." }
          }
        }
      },
      "/api/v1/messages/batch": {
        post: {
          summary: "Accept up to 100 outbound messages", operationId: "createMessageBatch",
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateMessageBatch" } } } },
          responses: { "202": { description: "Batch processed; inspect per-item results." }, "401": { description: "Invalid key or missing messages:write scope." }, "413": { description: "Batch exceeds 4 MB." }, "429": { description: "Rate or monthly plan limit exceeded." } }
        }
      },
      "/api/v1/relay/events": {
        get: {
          summary: "Poll retained events for the local relay", operationId: "readRelayEvents",
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "query", name: "endpointId", required: true, schema: { type: "string", format: "uuid" } },
            { in: "query", name: "cursor", required: false, schema: { type: "string" } },
            { in: "query", name: "history", required: false, schema: { type: "boolean", default: false } }
          ],
          responses: { "200": { description: "Project-scoped relay events and the next cursor." }, "401": { description: "Invalid key or missing events:read scope." } }
        }
      },
      "/in/{endpointId}": {
        post: {
          summary: "Accept an inbound provider webhook", operationId: "receiveProviderWebhook",
          parameters: [{ in: "path", name: "endpointId", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: { required: true, content: { "application/json": { schema: {} } } },
          responses: { "200": { description: "Provider request verified, deduplicated, and accepted." }, "401": { description: "Provider signature verification failed." }, "413": { description: "Payload exceeds 256 KB." }, "429": { description: "Rate or monthly plan limit exceeded." } }
        }
      },
      "/api/health": { get: { summary: "Read public component health", operationId: "getHealth", responses: { "200": { description: "Live component health." }, "503": { description: "Database unavailable." } } } }
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "PayloadGrid API key" } },
      schemas: {
        CreateMessage: { type: "object", required: ["applicationId", "eventType", "payload"], properties: { applicationId: { type: "string", format: "uuid" }, eventType: { type: "string", minLength: 1, maxLength: 120, examples: ["order.completed"] }, idempotencyKey: { type: "string", maxLength: 200 }, payload: {} } },
        CreateMessageBatch: { type: "object", required: ["events"], properties: { events: { type: "array", minItems: 1, maxItems: 100, items: { $ref: "#/components/schemas/CreateMessage" } } } },
        AcceptedMessage: { type: "object", required: ["ok", "messageId", "status", "queuedDeliveries"], properties: { ok: { type: "boolean", const: true }, messageId: { type: "string", format: "uuid" }, status: { type: "string", enum: ["accepted", "delivered"] }, duplicate: { type: "boolean" }, queuedDeliveries: { type: "integer" }, queueConfigured: { type: "boolean" } } }
      }
    }
  }, { headers: { "cache-control": "public, max-age=300" } });
}
