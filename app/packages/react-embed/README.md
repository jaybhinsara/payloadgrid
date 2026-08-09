# PayloadGrid React portal

```bash
npm install @payloadgrid/react
```

Generate a short-lived embed URL from your server, then pass it to the component. Never expose `PAYLOADGRID_EMBED_SECRET` or create tokens in browser code.

```tsx
import { PayloadGridPortal } from "@payloadgrid/react";

<PayloadGridPortal url={signedUrl} />
```
