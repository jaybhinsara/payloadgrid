import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const title = "Webhook Infrastructure for Reliable Delivery | PayloadGrid";
const description = "PayloadGrid is webhook infrastructure for SaaS and API teams. Send, receive, sign, retry, replay, and monitor webhooks from one secure control plane.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: "%s | PayloadGrid" },
  description,
  applicationName: "PayloadGrid",
  alternates: { canonical: "/" },
  keywords: ["webhook infrastructure", "webhook delivery", "webhook retries", "webhook gateway", "webhook monitoring", "webhook replay", "outbound webhooks", "inbound webhooks"],
  authors: [{ name: "PayloadGrid", url: "/" }],
  creator: "PayloadGrid",
  publisher: "PayloadGrid",
  category: "developer tools",
  icons: { icon: "/icon.svg" },
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
  }
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fbfcfa" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<Analytics /></body></html>;
}
