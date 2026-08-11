# PayloadGrid React portal

```bash
npm install @payloadgrid/react
```

Generate a short-lived embed URL from your server with an API key scoped to `embeds:write`, then pass it to the component. Never expose the API key in browser code.

```ts
const response = await fetch("https://payloadgrid.com/api/v1/embed-token", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.PAYLOADGRID_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    applicationId: "APPLICATION_UUID",
    permissions: ["deliveries:read", "endpoints:read", "endpoints:write", "subscriptions:write", "secrets:rotate"],
    expiresInMinutes: 30,
  }),
});

const { url: signedUrl } = await response.json();
```

```tsx
import { PayloadGridPortal } from "@payloadgrid/react";

<PayloadGridPortal url={signedUrl} />
```

Use focused exports when the host product provides separate settings and activity screens:

```tsx
import { PayloadGridDeliveryHistory, PayloadGridEndpointManager } from "@payloadgrid/react";

<PayloadGridDeliveryHistory url={signedUrl} />
<PayloadGridEndpointManager url={signedUrl} />
```
