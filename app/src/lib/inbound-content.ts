export type ParsedInboundBody = {
  contentType: string;
  payload: unknown;
  rawBody: string;
};

function formPayload(rawBody: string) {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of new URLSearchParams(rawBody)) {
    const existing = result[key];
    if (existing === undefined) result[key] = value;
    else result[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return result;
}

export function parseInboundBody(rawBody: string, headerValue: string | null): ParsedInboundBody {
  const contentType = (headerValue || "application/octet-stream").split(";", 1)[0].trim().toLowerCase();
  if (!rawBody) return { contentType, payload: {}, rawBody };
  if (contentType === "application/json" || contentType.endsWith("+json")) {
    try { return { contentType, payload: JSON.parse(rawBody), rawBody }; }
    catch { throw new Error("Webhook body contains invalid JSON"); }
  }
  if (contentType === "application/x-www-form-urlencoded") {
    return { contentType, payload: formPayload(rawBody), rawBody };
  }
  if (contentType === "text/xml" || contentType === "application/xml" || contentType.endsWith("+xml")) {
    return { contentType, payload: { raw: rawBody, format: "xml" }, rawBody };
  }
  if (contentType.startsWith("text/")) return { contentType, payload: { raw: rawBody, format: "text" }, rawBody };
  return { contentType, payload: { raw: rawBody, format: "binary-text" }, rawBody };
}
