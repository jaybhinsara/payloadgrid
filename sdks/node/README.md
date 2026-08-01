# @payloadgrid/node

Source-ready beta Node.js client. This package has not been published to npm yet.

```ts
import { PayloadGrid } from "@payloadgrid/node";
const client = new PayloadGrid({ apiKey: process.env.PAYLOADGRID_API_KEY! });
await client.messagesCreate({
  applicationId: process.env.PAYLOADGRID_APPLICATION_ID!,
  eventType: "order.completed",
  idempotencyKey: "order_8921_completed",
  payload: { orderId: "8921" }
});
```