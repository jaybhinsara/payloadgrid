# PayloadGrid React portal

Generate a short-lived embed URL from your server, then pass it to the component. Never expose `PAYLOADGRID_EMBED_SECRET` or create tokens in browser code.

```tsx
<PayloadGridPortal url={signedUrl} />
```
