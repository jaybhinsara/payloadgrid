# PayloadGrid CLI

The official PayloadGrid CLI mirrors newly ingested webhook events to a local HTTP handler. It uses authenticated polling and does not require a permanent public tunnel.

```bash
npm install -g payloadgrid-cli
pg login --api-key pg_live_your_key
pg listen --endpoint ENDPOINT_UUID --forward http://localhost:3000/webhooks
```

Create a project API key with only the `events:read` permission. The key is stored in `~/.payloadgrid/config.json`; keep this file private and revoke the key from the PayloadGrid dashboard if the machine is lost or shared.

Add `--history` to relay the latest retained events before listening for new ones. Add `--once` for a bounded test invocation.

```text
pg login --api-key pg_live_... [--api-url https://payloadgrid.com]
pg listen --endpoint UUID --forward http://localhost:3000/webhooks [--history] [--once]
```
