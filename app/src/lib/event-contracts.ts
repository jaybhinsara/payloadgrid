import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { requireSql } from "@/lib/db";

const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
addFormats(ajv);

export type ContractWarning = { path: string; keyword: string; message: string };
export type PublishedContract = { eventTypeId: string; version: number; schema: Record<string, unknown>; example: unknown };

function warnings(errors: ErrorObject[] | null | undefined): ContractWarning[] {
  return (errors || []).slice(0, 25).map((error) => ({ path: error.instancePath || "/", keyword: error.keyword, message: error.message || "Schema validation failed" }));
}

export function assertJsonSchema(schema: unknown) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema) || !ajv.validateSchema(schema)) {
    throw new Error(ajv.errorsText(ajv.errors, { separator: "; " }) || "Invalid JSON Schema");
  }
}

export function compatibilityWarnings(previous: Record<string, unknown> | null, next: Record<string, unknown>) {
  if (!previous) return [] as string[];
  const result: string[] = [];
  const walk = (before: Record<string, unknown>, after: Record<string, unknown>, path: string) => {
    const beforeType = before.type;
    const afterType = after.type;
    if (beforeType && afterType && JSON.stringify(beforeType) !== JSON.stringify(afterType)) result.push(`${path}: type changed from ${JSON.stringify(beforeType)} to ${JSON.stringify(afterType)}`);
    const beforeProperties = (before.properties && typeof before.properties === "object" ? before.properties : {}) as Record<string, Record<string, unknown>>;
    const afterProperties = (after.properties && typeof after.properties === "object" ? after.properties : {}) as Record<string, Record<string, unknown>>;
    for (const [name, property] of Object.entries(beforeProperties)) {
      if (!afterProperties[name]) result.push(`${path}/${name}: property was removed`);
      else walk(property, afterProperties[name], `${path}/${name}`);
    }
    const beforeRequired = new Set(Array.isArray(before.required) ? before.required.map(String) : []);
    for (const name of Array.isArray(after.required) ? after.required.map(String) : []) if (!beforeRequired.has(name)) result.push(`${path}/${name}: newly required property`);
    if (before.additionalProperties !== false && after.additionalProperties === false) result.push(`${path}: additional properties are now rejected`);
  };
  walk(previous, next, "$");
  return result;
}

export async function publishedContract(projectId: string, applicationId: string | null, eventType: string): Promise<PublishedContract | null> {
  const sql = requireSql();
  const [row] = await sql`
    select et.id as event_type_id, ec.version, ec.schema, ec.example
    from event_types et join event_contract_versions ec on ec.event_type_id = et.id and ec.status = 'published'
    where et.project_id = ${projectId} and et.name = ${eventType}
      and (et.application_id = ${applicationId}::uuid or et.application_id is null)
    order by (et.application_id is not null) desc, ec.version desc limit 1
  `;
  return row ? { eventTypeId: String(row.event_type_id), version: Number(row.version), schema: row.schema as Record<string, unknown>, example: row.example } : null;
}

export async function validateEventPayload(projectId: string, applicationId: string | null, eventType: string, payload: unknown) {
  const contract = await publishedContract(projectId, applicationId, eventType);
  if (!contract) return { contractVersion: null, warnings: [] as ContractWarning[] };
  try {
    const validate = ajv.compile(contract.schema);
    validate(payload);
    return { contractVersion: contract.version, warnings: warnings(validate.errors) };
  } catch (error) {
    return { contractVersion: contract.version, warnings: [{ path: "/", keyword: "compile", message: error instanceof Error ? error.message : "Contract could not be compiled" }] };
  }
}
