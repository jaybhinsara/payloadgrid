import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PayloadGrid Webhook Infrastructure",
    short_name: "PayloadGrid",
    description: "Reliable inbound and outbound webhook delivery, retries, replay, signatures, and monitoring.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfcfa",
    theme_color: "#ef5b46",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }]
  };
}
