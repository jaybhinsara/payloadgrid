import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const title = "Webhook Infrastructure for Reliable Delivery | PayloadGrid";
const description = "PayloadGrid is global webhook infrastructure for SaaS and developer teams. Send, receive, verify, retry, replay, and monitor webhook delivery.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: "%s | PayloadGrid" },
  description,
  applicationName: "PayloadGrid",
  keywords: ["webhook infrastructure", "webhook delivery", "webhook retries", "webhook gateway", "webhook monitoring", "webhook replay", "outbound webhooks", "inbound webhooks", "webhook API", "webhook service", "payment webhooks", "commerce webhooks"],
  authors: [{ name: "PayloadGrid", url: "/" }],
  creator: "PayloadGrid",
  publisher: "PayloadGrid",
  category: "developer tools",
  icons: {
      icon: [
        {
          url: "/icon.svg",
          sizes: "any",
          type: "image/svg+xml",
        },
      ],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "PayloadGrid",
    title,
    description
  },
  twitter: {
    card: "summary_large_image",
    title,
    description
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fbfcfa" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<Analytics /></body></html>;
}
