# PayloadGrid TypeScript SDK

```js
import { PayloadGrid } from "@payloadgrid/sdk";

const payloadgrid = new PayloadGrid({ apiKey: process.env.PAYLOADGRID_API_KEY });
await payloadgrid.send({ applicationId: "APP_UUID", eventType: "order.completed", payload: { orderId: "8921" } }, { idempotencyKey: "order-8921-completed" });
```
