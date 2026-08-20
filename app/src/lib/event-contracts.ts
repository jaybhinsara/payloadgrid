import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { requireSql } from "@/lib/db";

const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true, addUsedSchema: false });
addFormats(ajv);
const validatorCache = new Map<string, ReturnType<typeof ajv.compile>>();
const MAX_CACHED_VALIDATORS = 250;

export type ContractWarning = { path: string; keyword: string; message: string };
export type PublishedContract = { eventTypeId: string; version: number; schema: Record<string, unknown>; example: unknown };
export class ContractDefinitionError extends Error {}

function warnings(errors: ErrorObject[] | null | undefined): ContractWarning[] {
  return (errors || []).slice(0, 25).map((error) => ({ path: error.instancePath || "/", keyword: error.keyword, message: error.message || "Schema validation failed" }));
}

export function assertJsonSchema(schema: unknown) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema) || !ajv.validateSchema(schema)) {
    throw new ContractDefinitionError(ajv.errorsText(ajv.errors, { separator: "; " }) || "Invalid JSON Schema");
  }
}

export function assertExampleMatchesSchema(schema: Record<string, unknown>, example: unknown) {
  if (example === undefined) return;
  try {
    const validate = ajv.compile(schema);
    if (!validate(example)) throw new ContractDefinitionError(`Example payload does not match the schema: ${warnings(validate.errors).map((warning) => `${warning.path} ${warning.message}`).join("; ")}`);
  } catch (error) {
    if (error instanceof ContractDefinitionError) throw error;
    throw new ContractDefinitionError(error instanceof Error ? error.message : "JSON Schema could not be compiled");
  }
}

export function compatibilityWarnings(previous: Record<string, unknown> | null, next: Record<string, unknown>) {
  if (!previous) return [] as string[];
  const result: string[] = [];
  const add = (warning: string) => { if (!result.includes(warning)) result.push(warning); };
  const values = (value: unknown) => Array.isArray(value) ? value.map(String) : value === undefined ? [] : [String(value)];
  const number = (value: unknown) => typeof value === "number" ? value : null;
  const walk = (before: Record<string, unknown>, after: Record<string, unknown>, path: string) => {
    const beforeTypes = values(before.type);
    const afterTypes = values(after.type);
    if (beforeTypes.length && afterTypes.length && beforeTypes.some((type) => !afterTypes.includes(type))) add(`${path}: accepted type ${beforeTypes.find((type) => !afterTypes.includes(type))} is no longer allowed`);
    if ("const" in before && JSON.stringify(before.const) !== JSON.stringify(after.const)) add(`${path}: constant value changed`);
    if (Array.isArray(before.enum) && Array.isArray(after.enum)) {
      for (const option of before.enum) if (!after.enum.some((candidate) => JSON.stringify(candidate) === JSON.stringify(option))) add(`${path}: enum value ${JSON.stringify(option)} was removed`);
    }
    const beforeProperties = (before.properties && typeof before.properties === "object" ? before.properties : {}) as Record<string, Record<string, unknown>>;
    const afterProperties = (after.properties && typeof after.properties === "object" ? after.properties : {}) as Record<string, Record<string, unknown>>;
    for (const [name, property] of Object.entries(beforeProperties)) {
      if (!afterProperties[name] && after.additionalProperties === false) add(`${path}/${name}: property is no longer accepted`);
      else if (afterProperties[name]) walk(property, afterProperties[name], `${path}/${name}`);
    }
    const beforeRequired = new Set(Array.isArray(before.required) ? before.required.map(String) : []);
    for (const name of Array.isArray(after.required) ? after.required.map(String) : []) if (!beforeRequired.has(name)) add(`${path}/${name}: newly required property`);
    if (before.additionalProperties !== false && after.additionalProperties === false) add(`${path}: additional properties are now rejected`);

    const increasingMinimums: Array<[string, unknown, unknown]> = [["minimum", before.minimum, after.minimum], ["exclusiveMinimum", before.exclusiveMinimum, after.exclusiveMinimum], ["minLength", before.minLength, after.minLength], ["minItems", before.minItems, after.minItems]];
    for (const [keyword, oldValue, newValue] of increasingMinimums) if (number(newValue) !== null && (number(oldValue) === null || number(newValue)! > number(oldValue)!)) add(`${path}: ${keyword} became more restrictive`);
    const decreasingMaximums: Array<[string, unknown, unknown]> = [["maximum", before.maximum, after.maximum], ["exclusiveMaximum", before.exclusiveMaximum, after.exclusiveMaximum], ["maxLength", before.maxLength, after.maxLength], ["maxItems", before.maxItems, after.maxItems]];
    for (const [keyword, oldValue, newValue] of decreasingMaximums) if (number(newValue) !== null && (number(oldValue) === null || number(newValue)! < number(oldValue)!)) add(`${path}: ${keyword} became more restrictive`);
    if (after.pattern && after.pattern !== before.pattern) add(`${path}: string pattern changed`);
    if (after.format && after.format !== before.format) add(`${path}: format changed from ${String(before.format || "unrestricted")} to ${String(after.format)}`);
    if (before.items && after.items && typeof before.items === "object" && typeof after.items === "object" && !Array.isArray(before.items) && !Array.isArray(after.items)) walk(before.items as Record<string, unknown>, after.items as Record<string, unknown>, `${path}[]`);
  };
  walk(previous, next, "$");
  return result;
}

function validator(contract: PublishedContract) {
  const key = `${contract.eventTypeId}:${contract.version}`;
  const cached = validatorCache.get(key);
  if (cached) return cached;
  const compiled = ajv.compile(contract.schema);
  if (validatorCache.size >= MAX_CACHED_VALIDATORS) validatorCache.delete(validatorCache.keys().next().value!);
  validatorCache.set(key, compiled);
  return compiled;
}

export function validateContractPayload(contract: PublishedContract | null, payload: unknown) {
  if (!contract) return { contractVersion: null, warnings: [] as ContractWarning[] };
  try {
    const validate = validator(contract);
    validate(payload);
    return { contractVersion: contract.version, warnings: warnings(validate.errors) };
  } catch (error) {
    return { contractVersion: contract.version, warnings: [{ path: "/", keyword: "compile", message: error instanceof Error ? error.message : "Contract could not be compiled" }] };
  }
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
  return validateContractPayload(contract, payload);
}
