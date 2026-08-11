# PayloadGrid CLI

The official PayloadGrid CLI mirrors newly ingested webhook events to a local HTTP handler. It uses authenticated polling and does not require a permanent public tunnel.

```bash
npm install -g payloadgrid-cli
pg login --api-key pg_live_your_key
pg listen --endpoint ENDPOINT_UUID --forward http://localhost:3000/webhooks
```

Create a project API key with only the `events:read` permission. The key is stored in `~/.payloadgrid/config.json`; keep this file private and revoke the key from the PayloadGrid dashboard if the machine is lost or shared.

Add `--history` to relay the latest retained events before listening for new ones. Add `--once` for a bounded test invocation.

Tail and inspect retained traffic without forwarding it:

```bash
pg tail --endpoint ENDPOINT_UUID --event-type payment.captured --direction inbound --history
pg inspect --endpoint ENDPOINT_UUID --event-id EVENT_UUID
```

Generate types from the latest published JSON Schema contracts:

```bash
pg types --application APPLICATION_UUID --language typescript --out events.ts
pg types --application APPLICATION_UUID --language python --out events.py
```

```text
pg login --api-key pg_live_... [--api-url https://payloadgrid.com]
pg listen --endpoint UUID --forward http://localhost:3000/webhooks [--history] [--once]
pg tail --endpoint UUID [--event-type NAME] [--direction inbound|outbound] [--history]
pg inspect --endpoint UUID --event-id UUID
pg types --application UUID --language typescript|python [--out FILE]
```
