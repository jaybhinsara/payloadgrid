export const MAX_EVENT_PAYLOAD_BYTES = 256 * 1024;
export const MAX_BATCH_BODY_BYTES = 4 * 1024 * 1024;
export const MAX_BATCH_EVENTS = 100;

export function payloadBytes(payload: unknown) {
  return Buffer.byteLength(JSON.stringify(payload), "utf8");
}

export function assertPayloadSize(payload: unknown) {
  if (payloadBytes(payload) > MAX_EVENT_PAYLOAD_BYTES) {
    throw new Error("Payload exceeds the 256 KB plan limit");
  }
}
