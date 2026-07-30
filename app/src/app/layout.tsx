import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "HookIn | Webhook infrastructure", template: "%s | HookIn" },
  description: "Send, receive, sign, monitor, and recover webhooks from one multi-tenant control plane.",
  applicationName: "HookIn",
  metadataBase: new URL(process.env.HOOKIN_APP_URL || "http://localhost:3200")
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f8f6" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }